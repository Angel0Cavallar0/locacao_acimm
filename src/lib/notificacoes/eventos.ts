import "server-only";
import { dataSP, horaSP, utcParaNaiveSP } from "@/lib/calendario/tempo";
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
import { carregarTemplatesDesativados } from "./templates-dados";
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
  /** Preferência de canal da locação (colaborador, atendimento assistido). */
  notificarWhatsapp: boolean;
  notificarEmail: boolean;
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
       forma_pagamento_preferida, motivo_encerramento,
       notificar_whatsapp, notificar_email`,
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
    notificarWhatsapp: (loc.notificar_whatsapp as boolean | null) ?? true,
    notificarEmail: (loc.notificar_email as boolean | null) ?? true,
  };
}

/** Insere as linhas válidas (destinatário não-vazio) e agenda o disparo.
 * Gate liga/desliga (§C): templates desativados não entram na fila. Fail-open —
 * erro ao ler a config nunca bloqueia o envio. */
async function enfileirar(
  admin: Admin,
  locacaoId: string | null,
  linhas: LinhaFila[],
): Promise<void> {
  const desativados = await carregarTemplatesDesativados();
  const validas = linhas.filter(
    (l) =>
      l.destinatario &&
      l.destinatario.trim().length > 0 &&
      !desativados.has(l.template),
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

/**
 * Par (WhatsApp + e-mail) ao locatário com o mesmo template/payload. Omite o
 * canal que o colaborador desligou para esta locação (atendimento assistido)
 * — único ponto de passagem de toda notificação voltada ao locatário, então
 * o gate aqui cobre aprovação/recusa/confirmação/contrato/pagamento/lembrete.
 */
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
  const linhas: LinhaFila[] = [];
  if (base.notificarWhatsapp) {
    linhas.push({ canal: "whatsapp", destinatario: base.telefone, template, payload });
  }
  if (base.notificarEmail) {
    linhas.push({ canal: "email", destinatario: base.email, template, payload });
  }
  return linhas;
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

/** WhatsApp interno da ACIMM (Ciclo 2 / Spec 30 §4.3). Vazio → sem canal. */
async function contatoInternoWhatsapp(admin: Admin): Promise<string | null> {
  const { data } = await admin
    .from("configuracoes")
    .select("valor")
    .eq("chave", "contato_acimm")
    .maybeSingle();
  const whatsapp = (
    (data?.valor as { whatsapp?: string } | null)?.whatsapp ?? ""
  ).trim();
  return whatsapp || null;
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

/**
 * Resumo do pedido para a mensagem de aprovação (Ciclo 2 / Spec 30 §3.2):
 * sala(s), período, coffee (nível/pessoas/horário) e adicionais.
 */
async function montarResumoPedido(
  admin: Admin,
  locacaoId: string,
  base: BaseNotificacao,
): Promise<string> {
  const linhas = [`Sala(s): ${base.salas}`, `Data: ${base.data} · ${base.horario}`];

  const { data: coffee } = await admin
    .from("coffee_breaks")
    .select("qtd_pessoas, horario_servir, coffee_niveis ( nome )")
    .eq("locacao_id", locacaoId)
    .maybeSingle();
  if (coffee) {
    const nivel =
      (um(coffee.coffee_niveis as unknown) as { nome?: string } | null)?.nome ??
      "Coffee break";
    const servir = coffee.horario_servir
      ? ` · servir ${horaSP(coffee.horario_servir as string)}`
      : "";
    linhas.push(
      `Coffee break: ${nivel} · ${coffee.qtd_pessoas} pessoa(s)${servir}`,
    );
  }

  const { data: ads } = await admin
    .from("locacao_adicionais")
    .select("descricao, quantidade")
    .eq("locacao_id", locacaoId);
  const lista = (ads ?? []) as { descricao: string; quantidade: number }[];
  if (lista.length > 0) {
    const itens = lista
      .map((a) => `${a.descricao}${a.quantidade > 1 ? ` (x${a.quantidade})` : ""}`)
      .join(", ");
    linhas.push(`Adicionais: ${itens}`);
  }

  return linhas.join("\n");
}

export async function notificarAprovada(locacaoId: string): Promise<void> {
  const admin = createAdminClient();
  const base = await montarBase(admin, locacaoId);
  if (!base) return;
  const resumo = await montarResumoPedido(admin, locacaoId, base);
  await enfileirar(admin, locacaoId, parLocatario(base, "aprovada", { resumo }));
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
    parLocatario(base, peloAssociado ? "cancelada_associado" : "cancelada_acimm", {
      motivo: motivo || base.motivo,
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
      parLocatario(base, "contrato_enviado_autentique", { assinaturaLink }),
    );
    return;
  }

  // Modo e-mail: anti-duplicação — só WhatsApp.
  await enfileirar(admin, locacaoId, [
    {
      canal: "whatsapp",
      destinatario: base.telefone,
      template: "contrato_enviado_email",
      payload: { nome: base.nome, loc: base.loc, link: base.link },
    },
  ]);
}

/**
 * Envia o PDF do contrato ao locatário por WhatsApp (documento) — Ciclo 2 / Spec
 * 30 §4.1. O e-mail do cadastro costuma ser do financeiro/RH, não de quem loca;
 * o WhatsApp é o canal confiável. URL assinada (7 dias) para a Evolution baixar.
 */
export async function enfileirarContratoWhatsapp(
  locacaoId: string,
): Promise<{ ok: boolean; erro?: string }> {
  const admin = createAdminClient();
  const base = await montarBase(admin, locacaoId);
  if (!base) return { ok: false, erro: "Locação não encontrada." };
  if (!base.telefone) {
    return { ok: false, erro: "Locatário sem telefone para WhatsApp." };
  }

  const { data: contrato } = await admin
    .from("contratos")
    .select("pdf_url")
    .eq("locacao_id", locacaoId)
    .maybeSingle();
  const path = (contrato?.pdf_url as string | null) ?? null;
  if (!path) return { ok: false, erro: "PDF do contrato não encontrado." };

  const { data: signed } = await admin.storage
    .from("contratos")
    .createSignedUrl(path, 604800);
  if (!signed) {
    return { ok: false, erro: "Não foi possível gerar o link do contrato." };
  }

  await enfileirar(admin, locacaoId, [
    {
      canal: "whatsapp",
      destinatario: base.telefone,
      template: "contrato_whatsapp",
      payload: {
        nome: base.nome,
        loc: base.loc,
        link: base.link,
        documentoUrl: signed.signedUrl,
        documentoNome: `contrato-${base.loc}.pdf`,
      },
    },
  ]);
  return { ok: true };
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

/** Comprovante recebido — aviso interno à ACIMM por e-mail e WhatsApp (§5 / Spec
 * 30 §4.3). Cada canal só entra se o contato estiver configurado. */
export async function notificarComprovanteRecebido(
  locacaoId: string,
): Promise<void> {
  const admin = createAdminClient();
  const [interno, internoWhatsapp] = await Promise.all([
    contatoInterno(admin),
    contatoInternoWhatsapp(admin),
  ]);
  if (!interno && !internoWhatsapp) return;
  const base = await montarBase(admin, locacaoId);
  if (!base) return;

  const payload = {
    loc: base.loc,
    nome: base.nome,
    linkAdmin: base.linkAdmin,
  };
  const itens = [];
  if (interno) {
    itens.push({
      canal: "email" as const,
      destinatario: interno,
      template: "interna_comprovante_recebido",
      payload,
    });
  }
  if (internoWhatsapp) {
    itens.push({
      canal: "whatsapp" as const,
      destinatario: internoWhatsapp,
      template: "interna_comprovante_recebido",
      payload,
    });
  }
  await enfileirar(admin, locacaoId, itens);
}

/** Via assinada do contrato recebida — aviso interno à ACIMM (Spec 30 §4.2). */
export async function notificarContratoAssinadoRecebido(
  locacaoId: string,
): Promise<void> {
  const admin = createAdminClient();
  const [interno, internoWhatsapp] = await Promise.all([
    contatoInterno(admin),
    contatoInternoWhatsapp(admin),
  ]);
  if (!interno && !internoWhatsapp) return;
  const base = await montarBase(admin, locacaoId);
  if (!base) return;

  const payload = { loc: base.loc, nome: base.nome, linkAdmin: base.linkAdmin };
  const itens = [];
  if (interno) {
    itens.push({
      canal: "email" as const,
      destinatario: interno,
      template: "interna_contrato_assinado",
      payload,
    });
  }
  if (internoWhatsapp) {
    itens.push({
      canal: "whatsapp" as const,
      destinatario: internoWhatsapp,
      template: "interna_contrato_assinado",
      payload,
    });
  }
  await enfileirar(admin, locacaoId, itens);
}

/**
 * Vaga liberada (Spec 19 §6): avisa a ACIMM (interno) quando um horário com fila
 * fica livre. Match: mesma data e (sala liberada OU "qualquer sala"), ainda
 * aguardando. Sem fila → nenhum ruído. Nenhum disparo ao interessado — a equipe
 * contata pela tela. `locacao_id` null (a fila não pertence a uma locação).
 */
export async function notificarVagaLiberada(
  salaId: string,
  salaNome: string,
  dataISO: string,
): Promise<void> {
  const admin = createAdminClient();
  const interno = await contatoInterno(admin);
  if (!interno) return;

  const { data: fila } = await admin
    .from("lista_espera")
    .select("nome")
    .eq("data", dataISO)
    .is("convertido_locacao_id", null)
    .is("arquivado_em", null)
    .or(`sala_id.eq.${salaId},sala_id.is.null`)
    .order("criado_em", { ascending: true });

  const rows = (fila ?? []) as { nome: string }[];
  if (rows.length === 0) return;

  const dataFmt = dataISO.split("-").reverse().join("/");
  await enfileirar(admin, null, [
    {
      canal: "email",
      destinatario: interno,
      template: "interna_vaga_liberada",
      payload: {
        sala: salaNome,
        data: dataFmt,
        qtd: String(rows.length),
        primeiro: rows[0].nome,
        linkAdmin: `${envCore.APP_URL}/admin/lista-espera?sala=${salaId}&data=${dataISO}`,
      },
    },
  ]);
}

/** Todas as salas de uma locação liberada (recusa/cancelamento) → avisa a fila. */
export async function notificarVagasLocacao(locacaoId: string): Promise<void> {
  const admin = createAdminClient();
  const { data: loc } = await admin
    .from("locacoes")
    .select("inicio")
    .eq("id", locacaoId)
    .maybeSingle();
  if (!loc) return;
  const dataISO = utcParaNaiveSP(loc.inicio as string).slice(0, 10);

  const { data: salasRows } = await admin
    .from("locacao_salas")
    .select("sala_id, salas ( nome )")
    .eq("locacao_id", locacaoId);

  for (const r of (salasRows ?? []) as {
    sala_id: string;
    salas: { nome: string } | { nome: string }[] | null;
  }[]) {
    const salaNome = um(r.salas)?.nome ?? "sala";
    await notificarVagaLiberada(r.sala_id, salaNome, dataISO);
  }
}

/**
 * Comissão já paga ao colaborador foi estornada por cancelamento (Ciclo 2 / Spec
 * 29 §4.2). Só e-mail interno à ACIMM — é ajuste para a equipe lançar de volta no
 * controle dela. Config vazia → skip.
 */
export async function notificarComissaoEstornada(
  locacaoId: string,
  qtd: number,
): Promise<void> {
  const admin = createAdminClient();
  const interno = await contatoInterno(admin);
  if (!interno) return;

  const { data: loc } = await admin
    .from("locacoes")
    .select("numero, locatario_nome")
    .eq("id", locacaoId)
    .maybeSingle();
  if (!loc) return;

  await enfileirar(admin, locacaoId, [
    {
      canal: "email",
      destinatario: interno,
      template: "interna_comissao_estornada",
      payload: {
        loc: rot(loc.numero as number),
        nome: (loc.locatario_nome as string) ?? "—",
        qtd: String(qtd),
        linkAdmin: `${envCore.APP_URL}/admin/comissoes`,
      },
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
