import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { urlFotoSala } from "@/lib/storage";
import {
  STATUS_ROTULO,
  type StatusLocacao,
} from "./maquina-estados-core";
import type {
  AutorTipo,
  CardLocacao,
  EventoPortal,
  LocacaoPortalDetalhe,
  TabLocacoes,
} from "./portal-tipos";
import type { FormaPagamento } from "./tipos";

/** Normaliza embed to-one (o client às vezes tipa como array). */
function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

const STATUS_POR_TAB: Record<
  Exclude<TabLocacoes, "todas">,
  StatusLocacao[]
> = {
  andamento: [
    "solicitada",
    "em_analise",
    "aprovada",
    "contrato_enviado",
    "contrato_assinado",
    "aguardando_pagamento",
    "confirmada",
  ],
  realizadas: ["realizada", "finalizada"],
  encerradas: ["recusada", "cancelada"],
};

const CANCELAVEIS: StatusLocacao[] = ["solicitada", "em_analise"];

/** Cards de "Minhas locações" (§2) — filtrados por aba, do próprio associado. */
export async function listarMinhasLocacoes(
  associadoId: string,
  tab: TabLocacoes,
): Promise<CardLocacao[]> {
  const admin = createAdminClient();
  let q = admin
    .from("locacoes")
    .select(
      "id, numero, status, inicio, fim, valor_total_centavos, locacao_salas ( salas ( nome ) )",
    )
    .eq("associado_id", associadoId);

  if (tab !== "todas") q = q.in("status", STATUS_POR_TAB[tab]);
  // Em andamento: próximas primeiro. Demais: mais recentes primeiro.
  q = q.order("inicio", { ascending: tab === "andamento" });

  const { data } = await q;
  return ((data ?? []) as Array<{
    id: string;
    numero: number;
    status: StatusLocacao;
    inicio: string;
    fim: string;
    valor_total_centavos: number;
    locacao_salas: Array<{ salas: { nome: string } | { nome: string }[] | null }>;
  }>).map((row) => ({
    id: row.id,
    numero: row.numero,
    status: row.status,
    inicioUtc: row.inicio,
    fimUtc: row.fim,
    valorTotalCentavos: row.valor_total_centavos,
    salas: (row.locacao_salas ?? []).map((ls) => um(ls.salas)?.nome ?? "Sala"),
  }));
}

function autorTipo(
  autorUserId: string | null,
  associadoUserId: string | null,
): AutorTipo {
  if (!autorUserId) return "sistema";
  if (associadoUserId && autorUserId === associadoUserId) return "voce";
  return "acimm";
}

/**
 * Rótulo SANITIZADO do evento (whitelist). Nunca usa `observacao` bruta —
 * notas internas do colaborador jamais chegam ao portal (§3.1).
 */
function rotuloEvento(
  de: StatusLocacao | null,
  para: StatusLocacao,
  dados: unknown,
): string {
  if (de && de !== para) return STATUS_ROTULO[para];
  const d = (dados ?? null) as {
    tipo?: string;
    antes?: unknown;
    depois?: unknown;
  } | null;
  if (d?.tipo === "comprovante_enviado") return "Comprovante enviado";
  if (d?.tipo === "contrato_gerado") return "Contrato gerado";
  if (d?.tipo === "contrato_regerado") return "Contrato atualizado";
  if (d?.tipo === "contrato_reenviado") return "Contrato reenviado";
  if (d?.tipo === "contrato_assinado_enviado") return "Contrato assinado enviado";
  if (d?.tipo === "pagamento_criado") return "Instruções de pagamento disponíveis";
  if (d?.tipo === "pagamento_isento") return "Locação isenta de pagamento";
  if (d?.tipo === "pagamento_baixado") return "Pagamento confirmado";
  if (d?.tipo === "pagamento_estornado") return "Pagamento estornado";
  if (d?.tipo === "pagamentos_recompostos") return "Pagamento atualizado";
  if (d && ("antes" in d || "depois" in d)) {
    return "Horário ajustado pela ACIMM";
  }
  return STATUS_ROTULO[para];
}

/**
 * Detalhe da locação do associado (§3). Usa service role com verificação
 * EXPLÍCITA de posse (`associado_id`) — associado A nunca vê a locação de B,
 * inclusive por URL direta. A linha do tempo é montada aqui, já sanitizada.
 */
export async function carregarLocacaoAssociado(
  id: string,
  associado: { id: string; userId: string | null },
): Promise<LocacaoPortalDetalhe | null> {
  const admin = createAdminClient();

  const { data: loc } = await admin
    .from("locacoes")
    .select(
      `id, numero, status, associado_id, inicio, fim, qtd_pessoas, tipo_evento,
       observacoes, respostas_formulario, forma_pagamento_preferida,
       motivo_encerramento, valor_salas_centavos, valor_coffee_centavos,
       valor_adicionais_centavos, valor_descontos_centavos, valor_total_centavos`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!loc || loc.associado_id !== associado.id) return null;

  const [salasRes, adicRes, coffeeRes, contratoRes, pagRes, eventosRes] =
    await Promise.all([
      admin
        .from("locacao_salas")
        .select("valor_centavos, salas ( nome, fotos )")
        .eq("locacao_id", id),
      admin
        .from("locacao_adicionais")
        .select("descricao, quantidade, valor_unitario_centavos")
        .eq("locacao_id", id)
        .order("criado_em", { ascending: true }),
      admin
        .from("coffee_breaks")
        .select("qtd_pessoas, valor_centavos, horario_servir, coffee_niveis ( nome )")
        .eq("locacao_id", id)
        .maybeSingle(),
      admin
        .from("contratos")
        .select("status, link_assinatura, pdf_url, pdf_assinado_url, assinado_em")
        .eq("locacao_id", id)
        .maybeSingle(),
      admin
        .from("pagamentos")
        .select(
          "id, descricao, forma, valor_centavos, status, comprovante_url, baixa_em",
        )
        .eq("locacao_id", id)
        .order("criado_em", { ascending: true }),
      admin
        .from("locacao_eventos")
        .select("id, de, para, autor_user_id, dados, criado_em")
        .eq("locacao_id", id)
        .order("criado_em", { ascending: true }),
    ]);

  const salas = ((salasRes.data ?? []) as Array<{
    valor_centavos: number;
    salas: { nome: string; fotos: string[] | null } | { nome: string; fotos: string[] | null }[] | null;
  }>).map((ls) => {
    const s = um(ls.salas);
    return {
      nome: s?.nome ?? "Sala",
      valorCentavos: ls.valor_centavos,
      fotos: (s?.fotos ?? []).map(urlFotoSala),
    };
  });

  const coffeeRow = coffeeRes.data as {
    qtd_pessoas: number;
    valor_centavos: number;
    horario_servir: string | null;
    coffee_niveis: { nome: string } | { nome: string }[] | null;
  } | null;

  const contratoRow = contratoRes.data as {
    status: string;
    link_assinatura: string | null;
    pdf_url: string | null;
    pdf_assinado_url: string | null;
    assinado_em: string | null;
  } | null;

  const eventos: EventoPortal[] = (
    (eventosRes.data ?? []) as Array<{
      id: string;
      de: StatusLocacao | null;
      para: StatusLocacao;
      autor_user_id: string | null;
      dados: unknown;
      criado_em: string;
    }>
  ).map((e) => ({
    id: e.id,
    de: e.de,
    para: e.para,
    criadoEmUtc: e.criado_em,
    autorTipo: autorTipo(e.autor_user_id, associado.userId),
    rotulo: rotuloEvento(e.de, e.para, e.dados),
    motivo:
      e.para === "recusada" || e.para === "cancelada"
        ? (loc.motivo_encerramento ?? null)
        : null,
  }));

  const status = loc.status as StatusLocacao;

  return {
    id: loc.id,
    numero: loc.numero,
    status,
    inicioUtc: loc.inicio,
    fimUtc: loc.fim,
    qtdPessoas: loc.qtd_pessoas,
    tipoEvento: loc.tipo_evento,
    observacoes: loc.observacoes,
    respostasFormulario: (loc.respostas_formulario ?? {}) as Record<
      string,
      unknown
    >,
    formaPagamento: loc.forma_pagamento_preferida as FormaPagamento | null,
    motivoEncerramento: loc.motivo_encerramento,
    valorSalasCentavos: loc.valor_salas_centavos,
    valorCoffeeCentavos: loc.valor_coffee_centavos,
    valorAdicionaisCentavos: loc.valor_adicionais_centavos,
    valorDescontosCentavos: loc.valor_descontos_centavos,
    valorTotalCentavos: loc.valor_total_centavos,
    podeCancelar: CANCELAVEIS.includes(status),
    salas,
    adicionais: ((adicRes.data ?? []) as Array<{
      descricao: string;
      quantidade: number;
      valor_unitario_centavos: number;
    }>).map((a) => ({
      descricao: a.descricao,
      quantidade: a.quantidade,
      valorUnitarioCentavos: a.valor_unitario_centavos,
    })),
    coffee: coffeeRow
      ? {
          nivelNome: um(coffeeRow.coffee_niveis)?.nome ?? "Coffee",
          qtdPessoas: coffeeRow.qtd_pessoas,
          horarioServirUtc: coffeeRow.horario_servir,
          valorCentavos: coffeeRow.valor_centavos,
        }
      : null,
    contrato: contratoRow
      ? {
          status: contratoRow.status,
          linkAssinatura: contratoRow.link_assinatura,
          temPdf: Boolean(contratoRow.pdf_url),
          assinadoEmUtc: contratoRow.assinado_em,
          assinadoEnviado: Boolean(contratoRow.pdf_assinado_url),
        }
      : null,
    pagamentos: ((pagRes.data ?? []) as Array<{
      id: string;
      descricao: string;
      forma: FormaPagamento;
      valor_centavos: number;
      status: string;
      comprovante_url: string | null;
      baixa_em: string | null;
    }>).map((p) => ({
      id: p.id,
      descricao: p.descricao,
      forma: p.forma,
      valorCentavos: p.valor_centavos,
      status: p.status,
      temComprovante: Boolean(p.comprovante_url),
      baixaEmUtc: p.baixa_em,
    })),
    eventos,
  };
}
