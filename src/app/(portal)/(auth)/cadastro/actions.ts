"use server";

import { randomInt } from "node:crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { assinarProva, validarProva } from "@/lib/auth/prova-verificacao";
import { checarRateLimit } from "@/lib/auth/rate-limit";
import { enviarEmail, isResendConfigured } from "@/lib/integracoes/resend";
import { emailCodigoVerificacao } from "@/lib/notificacoes/emails";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { apenasDigitos, documentoValido } from "@/lib/utils/documento";
import {
  codigoSchema,
  documentoSchema,
  senhaAssociadoSchema,
} from "@/lib/validacoes/associado";

const COOLDOWN_MS = 60_000;

export interface OpcaoAssociado {
  id: string;
  rotulo: string;
  emailsMascarados: string[];
}

export type ResultadoIniciar =
  | { status: "nao_encontrado" }
  | { status: "ja_conta" }
  | { status: "selecionar"; opcoes: OpcaoAssociado[] }
  | { status: "enviar"; opcao: OpcaoAssociado }
  | { status: "erro"; mensagem: string };

const MSG_NAO_ENCONTRADO =
  "Não encontramos cadastro ativo para este documento. Entre em contato com a ACIMM.";

function ip(h: Headers): string {
  return (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconhecido";
}

function mascararEmail(email: string): string {
  const [local, dominio] = email.split("@");
  if (!dominio) return "•••";
  const inicio = local.slice(0, 1);
  return `${inicio}•••@${dominio}`;
}

/** Mostra o primeiro termo e mascara o resto (razão social parcial). */
function mascararNome(nome: string): string {
  const termos = nome.trim().split(/\s+/);
  if (termos.length <= 1) return `${nome.slice(0, 4)}•••`;
  return `${termos[0]} •••`;
}

function paraOpcao(a: {
  id: string;
  razao_social: string | null;
  nome: string;
  emails: string[];
}): OpcaoAssociado {
  return {
    id: a.id,
    rotulo: mascararNome(a.razao_social ?? a.nome),
    emailsMascarados: (a.emails ?? []).map(mascararEmail),
  };
}

type LinhaAssociado = {
  id: string;
  nome: string;
  razao_social: string | null;
  emails: string[];
  situacao: "ativo" | "suspenso" | "excluido";
  user_id: string | null;
};

async function buscarPorDocumento(documento: string): Promise<LinhaAssociado[]> {
  // O documento já foi validado por dígito verificador (documentoValido), o que
  // rejeita placeholders como 00000000000000 (dígitos repetidos). O match é
  // exato sobre os dígitos armazenados — não filtramos por `documento_valido`
  // do Sophus para não excluir associados legítimos com o flag divergente.
  const admin = createAdminClient();
  const { data } = await admin
    .from("associados")
    .select("id, nome, razao_social, emails, situacao, user_id")
    .eq("documento", documento);
  return (data ?? []) as LinhaAssociado[];
}

export async function iniciarCadastro(
  documentoBruto: string,
): Promise<ResultadoIniciar> {
  const parsed = documentoSchema.safeParse({ documento: documentoBruto });
  if (!parsed.success) return { status: "nao_encontrado" };

  const documento = apenasDigitos(parsed.data.documento);
  if (!documentoValido(documento)) return { status: "nao_encontrado" };

  const h = await headers();
  if (!checarRateLimit(`cadastro:${ip(h)}:${documento}`).permitido) {
    return {
      status: "erro",
      mensagem: "Muitas tentativas. Aguarde um minuto e tente novamente.",
    };
  }

  const linhas = await buscarPorDocumento(documento);
  const elegiveis = linhas.filter(
    (l) => l.situacao === "ativo" && l.user_id === null,
  );

  if (elegiveis.length === 0) {
    // Já tem conta ativa? Orienta ao login. Senão, mensagem única.
    const temConta = linhas.some(
      (l) => l.situacao === "ativo" && l.user_id !== null,
    );
    return temConta ? { status: "ja_conta" } : { status: "nao_encontrado" };
  }

  if (elegiveis.length === 1) {
    return { status: "enviar", opcao: paraOpcao(elegiveis[0]) };
  }
  return { status: "selecionar", opcoes: elegiveis.map(paraOpcao) };
}

/** Revalida que o associado escolhido é elegível para primeiro acesso. */
async function associadoElegivel(
  associadoId: string,
  documento: string,
): Promise<LinhaAssociado | null> {
  if (!documentoValido(documento)) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("associados")
    .select("id, nome, razao_social, emails, situacao, user_id, documento")
    .eq("id", associadoId)
    .maybeSingle();
  if (!data) return null;
  const l = data as LinhaAssociado & { documento: string | null };
  if (
    apenasDigitos(l.documento ?? "") !== documento ||
    l.situacao !== "ativo" ||
    l.user_id !== null ||
    (l.emails ?? []).length === 0
  ) {
    return null;
  }
  return l;
}

export interface ResultadoEnviar {
  ok?: boolean;
  emailsMascarados?: string[];
  erro?: string;
}

export async function enviarCodigo(input: {
  associadoId: string;
  documento: string;
}): Promise<ResultadoEnviar> {
  const documento = apenasDigitos(input.documento);
  const h = await headers();
  if (!checarRateLimit(`codigo:${ip(h)}:${input.associadoId}`).permitido) {
    return { erro: "Muitas tentativas. Aguarde um minuto." };
  }

  const associado = await associadoElegivel(input.associadoId, documento);
  if (!associado) return { erro: MSG_NAO_ENCONTRADO };

  const admin = createAdminClient();

  // Cooldown de reenvio (60s desde o último código não usado).
  const { data: ultimo } = await admin
    .from("codigos_verificacao")
    .select("criado_em, usado_em")
    .eq("associado_id", associado.id)
    .order("criado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (
    ultimo?.usado_em == null &&
    ultimo?.criado_em &&
    Date.now() - new Date(ultimo.criado_em as string).getTime() < COOLDOWN_MS
  ) {
    return { erro: "Aguarde alguns segundos antes de reenviar o código." };
  }

  const codigo = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const { error: rpcErr } = await admin.rpc("criar_codigo_verificacao", {
    p_associado_id: associado.id,
    p_codigo: codigo,
    p_ttl_min: 15,
  });
  if (rpcErr) return { erro: "Não foi possível gerar o código. Tente novamente." };

  const emailMontado = emailCodigoVerificacao(codigo);
  if (isResendConfigured()) {
    try {
      await enviarEmail({
        para: associado.emails,
        assunto: emailMontado.assunto,
        html: emailMontado.html,
      });
    } catch {
      return { erro: "Não foi possível enviar o e-mail. Tente novamente." };
    }
  } else {
    // Dev sem RESEND_API_KEY: código no log do servidor (NUNCA em produção).
    console.info(
      `[dev] Código de verificação para ${associado.id}: ${codigo} (destinos: ${associado.emails.join(", ")})`,
    );
  }

  return { ok: true, emailsMascarados: associado.emails.map(mascararEmail) };
}

export interface ResultadoVerificar {
  ok?: boolean;
  prova?: string;
  emails?: string[];
  erro?: string;
}

export async function verificarCodigo(input: {
  associadoId: string;
  documento: string;
  codigo: string;
}): Promise<ResultadoVerificar> {
  const parsed = codigoSchema.safeParse({ codigo: input.codigo });
  if (!parsed.success) return { erro: "O código tem 6 dígitos." };

  const documento = apenasDigitos(input.documento);
  const h = await headers();
  if (!checarRateLimit(`verif:${ip(h)}:${input.associadoId}`).permitido) {
    return { erro: "Muitas tentativas. Aguarde um minuto." };
  }

  const associado = await associadoElegivel(input.associadoId, documento);
  if (!associado) return { erro: MSG_NAO_ENCONTRADO };

  const admin = createAdminClient();
  const { data: resultado, error } = await admin.rpc(
    "verificar_codigo_verificacao",
    {
      p_associado_id: associado.id,
      p_codigo: parsed.data.codigo,
      p_max_tentativas: 5,
    },
  );
  if (error) return { erro: "Não foi possível verificar. Tente novamente." };

  switch (resultado as string) {
    case "ok":
      return {
        ok: true,
        prova: assinarProva(associado.id),
        emails: associado.emails,
      };
    case "expirado":
      return { erro: "Código expirado. Reenvie um novo código." };
    case "excedido":
      return { erro: "Muitas tentativas. Reenvie um novo código." };
    default:
      return { erro: "Código incorreto." };
  }
}

export interface ResultadoCriarConta {
  erro?: string;
}

export async function criarConta(input: {
  associadoId: string;
  documento: string;
  prova: string;
  emailLogin: string;
  senha: string;
  confirmacao: string;
}): Promise<ResultadoCriarConta> {
  const provaAssociadoId = validarProva(input.prova);
  if (!provaAssociadoId || provaAssociadoId !== input.associadoId) {
    return { erro: "Verificação expirada. Refaça o primeiro acesso." };
  }

  const senhaParsed = senhaAssociadoSchema.safeParse({
    senha: input.senha,
    confirmacao: input.confirmacao,
  });
  if (!senhaParsed.success) {
    return { erro: senhaParsed.error.issues[0]?.message ?? "Senha inválida." };
  }

  const documento = apenasDigitos(input.documento);
  const associado = await associadoElegivel(input.associadoId, documento);
  if (!associado) return { erro: MSG_NAO_ENCONTRADO };

  const emailLogin = input.emailLogin.trim().toLowerCase();
  const permitido = associado.emails.some((e) => e.toLowerCase() === emailLogin);
  if (!permitido) return { erro: "E-mail inválido para este cadastro." };

  const admin = createAdminClient();

  const { data: criado, error: criarErr } = await admin.auth.admin.createUser({
    email: emailLogin,
    password: input.senha,
    email_confirm: true,
  });
  if (criarErr || !criado?.user) {
    return {
      erro: criarErr?.message?.includes("already")
        ? "Este e-mail já está em uso. Use 'Esqueci minha senha' ou fale com a ACIMM."
        : "Não foi possível criar a conta. Tente novamente.",
    };
  }

  // Vincula o associado; se já foi vinculado numa corrida, remove o auth user.
  const { data: vinculado, error: vincErr } = await admin
    .from("associados")
    .update({ user_id: criado.user.id })
    .eq("id", associado.id)
    .is("user_id", null)
    .select("id")
    .maybeSingle();
  if (vincErr || !vinculado) {
    await admin.auth.admin.deleteUser(criado.user.id);
    return { erro: "Este cadastro já possui conta. Tente entrar." };
  }

  // Inicia a sessão do novo usuário (define os cookies) e entra no portal.
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: emailLogin,
    password: input.senha,
  });
  if (signInErr) redirect("/login");

  redirect("/disponibilidade");
}
