import "server-only";
import { dataSP, horaSP } from "@/lib/calendario/tempo";
import {
  type DadosPagamento,
  parsearDadosPagamento,
  parsearModoEnvio,
} from "@/lib/contratos/tipos";
import { envCore } from "@/lib/env";
import type { StatusLocacao } from "@/lib/locacoes/maquina-estados-core";
import type { FormaPagamento } from "@/lib/locacoes/tipos";
import { createAdminClient } from "@/lib/supabase/admin";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { agendarProcessamento } from "./processar";
import type { PayloadNotificacao } from "./templates";

/**
 * Enfileiramento por evento (Spec 15). Cada função carrega os dados da locação,
 * monta o payload já formatado (Sao_Paulo/BRL) e insere as linhas em
 * `notificacoes` (par = 2 linhas), depois agenda o disparo imediato. NUNCA
 * envia inline. Falha aqui não pode quebrar a transição que a originou — quem
 * chama (efeitos) já isola exceções.
 */

type Admin = ReturnType<typeof createAdminClient>;
type Canal = "whatsapp" | "email";

interface LinhaFila {
  canal: Canal;
  destinatario: string | null;
  template: string;
  payload: PayloadNotificacao;
}

function rot(numero: number): string {
  return `LOC-${String(numero).padStart(6, "0")}`;
}

function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

interface BaseNotificacao {
  locacaoId: string;
  status: StatusLocacao;
  loc: string;
  nome: string;
  email: string;
  telefone: string;
  salas: string;
  data: string;
  horario: string;
  total: string;
  totalCentavos: number;
  formaPreferida: FormaPagamento | null;
  motivo: string;
  /** Link do portal — só quando o destinatário é o próprio associado (§4). */
  link: string;
  linkAdmin: string;
  associadoUserId: string | null;
}

async function montarBase(
  admin: Admin,
  locacaoId: string,
): Promise<BaseNotificacao | null> {
  const { data: loc } = await admin
    .from("locacoes")
    .select(
      `numero, status, locatario_nome, locatario_email, locatario_telefone,
       associado_id, inicio, fim, valor_total_centavos,
       forma_pagamento_preferida, motivo_encerramento`,
    )
    .eq("id", locacaoId)
    .maybeSingle();
  if (!loc) return null;

  const { data: salasRows } = await admin
    .from("locacao_salas")
    .select("salas ( nome )")
    .eq("locacao_id", locacaoId);
  const salas = (salasRows ?? [])
    .map((r) => um(r.salas as { nome: string } | { nome: string }[] | null)?.nome)
    .filter(Boolean)
    .join(", ");

  // Link do portal só se o destinatário for o próprio associado com conta.
  let link = "";
  let associadoUserId: string | null = null;
  const email = (loc.locatario_email as string | null) ?? "";
  if (loc.associado_id) {
    const { data: assoc } = await admin
      .from("associados")
      .select("emails, user_id")
      .eq("id", loc.associado_id)
      .maybeSingle();
    associadoUserId = (assoc?.user_id as string | null) ?? null;
    const emails = (assoc?.emails as string[] | null) ?? [];
    if (email && emails.includes(email)) {
      link = `${envCore.APP_URL}/locacoes/${locacaoId}`;
    }
  }

  return {
    locacaoId,
    status: loc.status as StatusLocacao,
    loc: rot(loc.numero as number),
    nome: (loc.locatario_nome as string) ?? "",
    email,
    telefone: (loc.locatario_telefone as string | null) ?? "",
    salas: salas || "sala",
    data: dataSP(loc.inicio as string),
    horario: `${horaSP(loc.inicio as string)}–${horaSP(loc.fim as string)}`,
    total: centavosParaBRL(loc.valor_total_centavos as number),
    totalCentavos: loc.valor_total_centavos as number,
    formaPreferida:
      (loc.forma_pagamento_preferida as FormaPagamento | null) ?? null,
    motivo: (loc.motivo_encerramento as string | null) ?? "",
    link,
    linkAdmin: `${envCore.APP_URL}/admin/locacoes/${locacaoId}`,
    associadoUserId,
  };
}

/** Insere as linhas válidas (destinatário não-vazio) e agenda o disparo. */
async function enfileirar(
  admin: Admin,
  locacaoId: string | null,
  linhas: LinhaFila[],
): Promise<void> {
  const validas = linhas.filter(
    (l) => l.destinatario && l.destinatario.trim().length > 0,
  );
  if (validas.length === 0) return;

  const { error } = await admin.from("notificacoes").insert(
    validas.map((l) => ({
      locacao_id: locacaoId,
      canal: l.canal,
      destinatario: (l.destinatario as string).trim(),
      template: l.template,
      payload: l.payload,
      status: "pendente" as const,
    })),
  );
  if (error) {
    console.error("[notificacoes] falha ao enfileirar:", error.message);
    return;
  }
  agendarProcessamento();
}

/** Par (WhatsApp + e-mail) ao locatário com o mesmo template/payload. */
function parLocatario(
  base: BaseNotificacao,
  template: string,
  extra: PayloadNotificacao = {},
): LinhaFila[] {
  const payload: PayloadNotificacao = {
    nome: base.nome,
    loc: base.loc,
    salas: base.salas,
    data: base.data,
    horario: base.horario,
    total: base.total,
    link: base.link,
    ...extra,
  };
  return [
    { canal: "whatsapp", destinatario: base.telefone, template, payload },
    { canal: "email", destinatario: base.email, template, payload },
  ];
}

/** E-mail interno à ACIMM (config vazia → skip, nem enfileira — §5). */
async function contatoInterno(admin: Admin): Promise<string | null> {
  const { data } = await admin
    .from("configuracoes")
    .select("valor")
    .eq("chave", "contato_acimm")
    .maybeSingle();
  const email = (data?.valor as { email?: string } | null)?.email;
  return email && email.includes("@") ? email : null;
}

// --- Eventos ---------------------------------------------------------------

export async function notificarSolicitada(locacaoId: string): Promise<void> {
  const admin = createAdminClient();
  const base = await montarBase(admin, locacaoId);
  if (!base) return;

  const linhas = parLocatario(base, "solicitacao_recebida");

  // Interna: nova solicitação aguardando análise (§5).
  const interno = await contatoInterno(admin);
  if (interno) {
    linhas.push({
      canal: "email",
      destinatario: interno,
      template: "interna_nova_solicitacao",
      payload: {
        loc: base.loc,
        nome: base.nome,
        salas: base.salas,
        data: base.data,
        horario: base.horario,
        total: base.total,
        linkAdmin: base.linkAdmin,
      },
    });
  }

  await enfileirar(admin, locacaoId, linhas);
}

export async function notificarAprovada(locacaoId: string): Promise<void> {
  const admin = createAdminClient();
  const base = await montarBase(admin, locacaoId);
  if (!base) return;
  await enfileirar(admin, locacaoId, parLocatario(base, "aprovada"));
}

export async function notificarRecusada(
  locacaoId: string,
  motivo?: string,
): Promise<void> {
  const admin = createAdminClient();
  const base = await montarBase(admin, locacaoId);
  if (!base) return;
  await enfileirar(
    admin,
    locacaoId,
    parLocatario(base, "recusada", { motivo: motivo || base.motivo }),
  );
}

export async function notificarCancelada(
  locacaoId: string,
  autorUserId: string | null,
  motivo?: string,
): Promise<void> {
  const admin = createAdminClient();
  const base = await montarBase(admin, locacaoId);
  if (!base) return;
  const peloAssociado =
    autorUserId !== null && autorUserId === base.associadoUserId;
  await enfileirar(
    admin,
    locacaoId,
    parLocatario(base, "cancelada", {
      motivo: motivo || base.motivo,
      peloAssociado,
    }),
  );
}

export async function notificarConfirmada(locacaoId: string): Promise<void> {
  const admin = createAdminClient();
  const base = await montarBase(admin, locacaoId);
  if (!base) return;
  await enfileirar(admin, locacaoId, parLocatario(base, "confirmada"));
}

/** Instruções de pagamento por forma (§4/Spec 14). Skip se não estiver mais
 * aguardando pagamento (ex.: isenção já confirmou). */
export async function notificarInstrucoesPagamento(
  locacaoId: string,
): Promise<void> {
  const admin = createAdminClient();
  const base = await montarBase(admin, locacaoId);
  if (!base || base.status !== "aguardando_pagamento") return;

  const { data: cfg } = await admin
    .from("configuracoes")
    .select("valor")
    .eq("chave", "dados_pagamento")
    .maybeSingle();
  const instrucoes = textoInstrucoes(
    base.formaPreferida,
    parsearDadosPagamento(cfg?.valor),
  );

  await enfileirar(
    admin,
    locacaoId,
    parLocatario(base, "instrucoes_pagamento", { instrucoes }),
  );
}

/** Contrato enviado. Modo e-mail (13B): só WhatsApp (o e-mail com anexo já foi).
 * Modo Autentique: ambos os canais com o link de assinatura (§4). */
export async function notificarContratoEnviado(
  locacaoId: string,
): Promise<void> {
  const admin = createAdminClient();
  const base = await montarBase(admin, locacaoId);
  if (!base) return;

  const { data: cfgModo } = await admin
    .from("configuracoes")
    .select("valor")
    .eq("chave", "modo_envio_contrato")
    .maybeSingle();
  const modo = parsearModoEnvio(cfgModo?.valor);

  if (modo === "autentique") {
    const { data: contrato } = await admin
      .from("contratos")
      .select("link_assinatura")
      .eq("locacao_id", locacaoId)
      .maybeSingle();
    const assinaturaLink = (contrato?.link_assinatura as string | null) ?? "";
    await enfileirar(
      admin,
      locacaoId,
      parLocatario(base, "contrato_enviado", { assinaturaLink }),
    );
    return;
  }

  // Modo e-mail: anti-duplicação — só WhatsApp.
  await enfileirar(admin, locacaoId, [
    {
      canal: "whatsapp",
      destinatario: base.telefone,
      template: "contrato_enviado",
      payload: { nome: base.nome, loc: base.loc, link: base.link },
    },
  ]);
}

/** Lembrete pré-evento (Spec 16). Dedupe: uma linha por locação/template —
 * rodar o job 2× no mesmo dia não duplica. Retorna se enfileirou. */
export async function notificarLembrete(locacaoId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("notificacoes")
    .select("id", { count: "exact", head: true })
    .eq("locacao_id", locacaoId)
    .eq("template", "lembrete_pre_evento");
  if ((count ?? 0) > 0) return false;

  const base = await montarBase(admin, locacaoId);
  if (!base) return false;
  await enfileirar(admin, locacaoId, parLocatario(base, "lembrete_pre_evento"));
  return true;
}

/** PDF semanal de compras → WhatsApp de compras como documento (Spec 16 §4.3).
 * Número não configurado → skip (sem lixo na fila). Retorna se enfileirou. */
export async function enfileirarCoffeePdf(input: {
  path: string;
  semana: string;
  rotulo: string;
  qtd: number;
}): Promise<boolean> {
  const admin = createAdminClient();
  const { data: cfg } = await admin
    .from("configuracoes")
    .select("valor")
    .eq("chave", "contato_compras")
    .maybeSingle();
  const whatsapp = (
    (cfg?.valor as { whatsapp?: string } | null)?.whatsapp ?? ""
  ).trim();
  if (!whatsapp) {
    console.info("[coffee-pdf] contato_compras.whatsapp vazio — envio ignorado.");
    return false;
  }

  // URL assinada (7 dias) para a Evolution baixar o documento.
  const { data: signed } = await admin.storage
    .from("coffee-pdfs")
    .createSignedUrl(input.path, 604800);
  if (!signed) return false;

  await enfileirar(admin, null, [
    {
      canal: "whatsapp",
      destinatario: whatsapp,
      template: "coffee_pdf",
      payload: {
        semana: input.semana,
        rotulo: input.rotulo,
        qtd: String(input.qtd),
        documentoUrl: signed.signedUrl,
        documentoNome: `compras-coffee-${input.semana}.pdf`,
      },
    },
  ]);
  return true;
}

/** Comprovante recebido — aviso interno à ACIMM (§5). */
export async function notificarComprovanteRecebido(
  locacaoId: string,
): Promise<void> {
  const admin = createAdminClient();
  const interno = await contatoInterno(admin);
  if (!interno) return;
  const base = await montarBase(admin, locacaoId);
  if (!base) return;

  await enfileirar(admin, locacaoId, [
    {
      canal: "email",
      destinatario: interno,
      template: "interna_comprovante_recebido",
      payload: { loc: base.loc, nome: base.nome, linkAdmin: base.linkAdmin },
    },
  ]);
}

/** Texto de instrução por forma de pagamento (usa `dados_pagamento`). */
function textoInstrucoes(
  forma: FormaPagamento | null,
  dp: DadosPagamento,
): string {
  switch (forma) {
    case "pix":
      return dp.pix
        ? `Pague via Pix — chave: ${dp.pix}.`
        : "Combine a chave Pix com a ACIMM para efetuar o pagamento.";
    case "transferencia":
      return `Transferência — ${dp.banco}${dp.codigoBanco ? ` (${dp.codigoBanco})` : ""}, Agência ${dp.agencia}, Conta ${dp.conta}.`;
    case "boleto_mensalidade":
      return "O valor será lançado na sua mensalidade da ACIMM.";
    case "boleto_avulso":
      return "O boleto será enviado pela ACIMM.";
    default:
      return "Consulte as instruções de pagamento no portal.";
  }
}
