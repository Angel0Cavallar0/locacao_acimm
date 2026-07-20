import "server-only";
import { intervaloSP, spWallParaUtc } from "@/lib/calendario/tempo";
import { parsearAdicionaisCoffee } from "@/lib/coffee/dados";
import type { CondicaoLocatario, PeriodoDia } from "@/lib/dominio";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StatusLocacao } from "./maquina-estados-core";
import type {
  AdicionalLinha,
  ContratoResumo,
  CoffeeLinha,
  EventoTimeline,
  FormaPagamento,
  LocacaoDetalhe,
  LocacaoLista,
  PagamentoLinha,
  SalaLinha,
} from "./tipos";

export const POR_PAGINA = 10;

export type VistaLista = "pendentes" | "andamento" | "proximas" | "todas";

export interface FiltrosLista {
  vista: VistaLista;
  salaId: string | null;
  condicao: CondicaoLocatario | null;
  forma: FormaPagamento | null;
  dataDe: string | null;
  dataAte: string | null;
  busca: string | null;
  pagina: number;
}

const STATUS_PENDENTES: StatusLocacao[] = ["solicitada", "em_analise"];
const STATUS_ANDAMENTO: StatusLocacao[] = [
  "aprovada",
  "contrato_enviado",
  "contrato_assinado",
  "aguardando_pagamento",
  "confirmada",
];

function statusDaVista(v: VistaLista): StatusLocacao[] | null {
  if (v === "pendentes") return STATUS_PENDENTES;
  if (v === "andamento") return STATUS_ANDAMENTO;
  return null; // "proximas" e "todas" não restringem por status
}

function nomesDeSalas(rel: unknown): string[] {
  // locacao_salas: [{ salas: {nome} | {nome}[] }]
  if (!Array.isArray(rel)) return [];
  const nomes: string[] = [];
  for (const ls of rel) {
    const s = (ls as { salas: unknown }).salas;
    const nome = Array.isArray(s)
      ? (s[0] as { nome?: string })?.nome
      : (s as { nome?: string })?.nome;
    if (nome) nomes.push(nome);
  }
  return nomes;
}

export async function listarLocacoes(
  f: FiltrosLista,
): Promise<{ linhas: LocacaoLista[]; total: number }> {
  const admin = createAdminClient();

  // Filtro por sala: pré-resolve os ids de locação (evita !inner que esconderia
  // as demais salas da linha).
  let idsPorSala: string[] | null = null;
  if (f.salaId) {
    const { data } = await admin
      .from("locacao_salas")
      .select("locacao_id")
      .eq("sala_id", f.salaId);
    idsPorSala = [...new Set((data ?? []).map((r) => r.locacao_id as string))];
    if (idsPorSala.length === 0) return { linhas: [], total: 0 };
  }

  let q = admin
    .from("locacoes")
    .select(
      `id, numero, condicao, locatario_nome, inicio, fim, status,
       valor_total_centavos, forma_pagamento_preferida, criado_em,
       locacao_salas ( salas ( nome ) )`,
      { count: "exact" },
    );

  const statuses = statusDaVista(f.vista);
  if (statuses) q = q.in("status", statuses);
  if (f.vista === "proximas") {
    const agora = new Date();
    const em7 = new Date(agora.getTime() + 7 * 86_400_000);
    q = q.gte("inicio", agora.toISOString()).lte("inicio", em7.toISOString());
  }
  if (f.condicao) q = q.eq("condicao", f.condicao);
  if (f.forma) q = q.eq("forma_pagamento_preferida", f.forma);
  if (idsPorSala) q = q.in("id", idsPorSala);
  if (f.dataDe) q = q.gte("inicio", spWallParaUtc(f.dataDe, "00:00"));
  if (f.dataAte) q = q.lte("inicio", spWallParaUtc(f.dataAte, "23:59"));
  if (f.busca) {
    const b = f.busca.trim().replace(/[,()]/g, " ");
    const ors = [`locatario_nome.ilike.%${b}%`, `locatario_documento.ilike.%${b}%`];
    const num = Number.parseInt(b.replace(/\D/g, ""), 10);
    if (!Number.isNaN(num)) ors.push(`numero.eq.${num}`);
    q = q.or(ors.join(","));
  }

  const from = (f.pagina - 1) * POR_PAGINA;
  q = q
    .order("inicio", { ascending: true })
    .order("criado_em", { ascending: false })
    .range(from, from + POR_PAGINA - 1);

  const { data, count } = await q;

  const linhas: LocacaoLista[] = (data ?? []).map((r) => ({
    id: r.id as string,
    numero: r.numero as number,
    condicao: r.condicao as CondicaoLocatario,
    locatario: r.locatario_nome as string,
    inicioUtc: r.inicio as string,
    fimUtc: r.fim as string,
    status: r.status as StatusLocacao,
    valorTotalCentavos: r.valor_total_centavos as number,
    formaPagamento: (r.forma_pagamento_preferida as FormaPagamento) ?? null,
    criadoEmUtc: r.criado_em as string,
    salas: nomesDeSalas(r.locacao_salas),
  }));

  return { linhas, total: count ?? 0 };
}

async function nomesDeColaboradores(
  ids: string[],
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return mapa;
  const admin = createAdminClient();
  const { data } = await admin
    .from("colaboradores")
    .select("user_id, nome")
    .in("user_id", unicos);
  for (const c of data ?? []) mapa.set(c.user_id as string, c.nome as string);

  // Autores que não são colaboradores podem ser associados (ex.: cancelamento
  // pelo portal — Spec 12). Resolve o nome real para a timeline do admin.
  const restantes = unicos.filter((id) => !mapa.has(id));
  if (restantes.length > 0) {
    const { data: assoc } = await admin
      .from("associados")
      .select("user_id, nome, razao_social")
      .in("user_id", restantes);
    for (const a of assoc ?? []) {
      mapa.set(
        a.user_id as string,
        (a.razao_social as string | null) ?? (a.nome as string),
      );
    }
  }
  return mapa;
}

export async function carregarLocacao(
  id: string,
): Promise<LocacaoDetalhe | null> {
  const admin = createAdminClient();

  const { data: loc } = await admin
    .from("locacoes")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!loc) return null;

  const [
    { data: salasRows },
    { data: adicionaisRows },
    { data: eventosRows },
    { data: coffeeRows },
    { data: contratoRow },
    { data: pagamentosRows },
    { data: associadoRow },
  ] = await Promise.all([
    admin
      .from("locacao_salas")
      .select("sala_id, valor_centavos, salas ( nome )")
      .eq("locacao_id", id),
    admin
      .from("locacao_adicionais")
      .select("id, descricao, quantidade, valor_unitario_centavos")
      .eq("locacao_id", id)
      .order("criado_em", { ascending: true }),
    admin
      .from("locacao_eventos")
      .select("id, de, para, autor_user_id, observacao, dados, criado_em")
      .eq("locacao_id", id)
      .order("criado_em", { ascending: false }),
    admin
      .from("coffee_breaks")
      .select(
        "id, nivel_id, qtd_pessoas, valor_centavos, horario_servir, adicionais, observacoes, coffee_niveis ( nome )",
      )
      .eq("locacao_id", id)
      .order("criado_em", { ascending: true }),
    admin
      .from("contratos")
      .select(
        "status, link_assinatura, pdf_url, pdf_assinado_url, enviado_em, assinado_em",
      )
      .eq("locacao_id", id)
      .maybeSingle(),
    admin
      .from("pagamentos")
      .select("id, descricao, forma, valor_centavos, status, comprovante_url")
      .eq("locacao_id", id)
      .order("criado_em", { ascending: true }),
    loc.associado_id
      ? admin
          .from("associados")
          .select("nome")
          .eq("id", loc.associado_id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const autores = [
    ...(eventosRows ?? []).map((e) => e.autor_user_id as string | null),
    loc.criado_por as string | null,
  ].filter((x): x is string => x !== null);
  const nomes = await nomesDeColaboradores(autores);

  const salas: SalaLinha[] = (salasRows ?? []).map((r) => {
    const s = r.salas as { nome?: string } | { nome?: string }[] | null;
    const nome = Array.isArray(s) ? (s[0]?.nome ?? "") : (s?.nome ?? "");
    return {
      salaId: r.sala_id as string,
      nome,
      valorCentavos: r.valor_centavos as number,
    };
  });

  const adicionais: AdicionalLinha[] = (adicionaisRows ?? []).map((r) => ({
    id: r.id as string,
    descricao: r.descricao as string,
    quantidade: Number(r.quantidade),
    valorUnitarioCentavos: r.valor_unitario_centavos as number,
  }));

  const eventos: EventoTimeline[] = (eventosRows ?? []).map((r) => {
    const autorId = r.autor_user_id as string | null;
    const autorNome = autorId
      ? (nomes.get(autorId) ?? "Associado")
      : "Sistema";
    return {
      id: r.id as string,
      de: (r.de as StatusLocacao) ?? null,
      para: r.para as StatusLocacao,
      autorNome,
      observacao: (r.observacao as string) ?? null,
      dados: r.dados,
      criadoEmUtc: r.criado_em as string,
    };
  });

  const coffee: CoffeeLinha[] = (coffeeRows ?? []).map((r) => {
    const n = r.coffee_niveis as { nome?: string } | { nome?: string }[] | null;
    const nivelNome = Array.isArray(n) ? (n[0]?.nome ?? "") : (n?.nome ?? "");
    return {
      id: r.id as string,
      nivelId: r.nivel_id as string,
      nivelNome,
      qtdPessoas: r.qtd_pessoas as number,
      valorCentavos: r.valor_centavos as number,
      horarioServirUtc: (r.horario_servir as string) ?? null,
      adicionais: parsearAdicionaisCoffee(r.adicionais),
      observacoes: (r.observacoes as string) ?? null,
    };
  });

  const contrato: ContratoResumo | null = contratoRow
    ? {
        status: contratoRow.status as string,
        linkAssinatura: (contratoRow.link_assinatura as string) ?? null,
        pdfUrl: (contratoRow.pdf_url as string) ?? null,
        temAssinado: Boolean(contratoRow.pdf_assinado_url),
        enviadoEmUtc: (contratoRow.enviado_em as string) ?? null,
        assinadoEmUtc: (contratoRow.assinado_em as string) ?? null,
      }
    : null;

  const pagamentos: PagamentoLinha[] = (pagamentosRows ?? []).map((r) => ({
    id: r.id as string,
    descricao: r.descricao as string,
    forma: r.forma as FormaPagamento,
    valorCentavos: r.valor_centavos as number,
    status: r.status as string,
    comprovanteUrl: (r.comprovante_url as string) ?? null,
  }));

  const associadoNome =
    (associadoRow as { nome?: string } | null)?.nome ?? null;

  return {
    id: loc.id,
    numero: loc.numero,
    status: loc.status as StatusLocacao,
    condicao: loc.condicao as CondicaoLocatario,
    periodo: (loc.periodo as PeriodoDia) ?? null,
    inicioUtc: loc.inicio,
    fimUtc: loc.fim,
    qtdPessoas: loc.qtd_pessoas,
    tipoEvento: loc.tipo_evento ?? null,
    observacoes: loc.observacoes ?? null,
    respostasFormulario: (loc.respostas_formulario ?? {}) as Record<
      string,
      unknown
    >,
    locatarioNome: loc.locatario_nome,
    locatarioDocumento: loc.locatario_documento,
    locatarioEmail: loc.locatario_email,
    locatarioTelefone: loc.locatario_telefone,
    responsavelNome: loc.responsavel_nome ?? null,
    associadoId: loc.associado_id ?? null,
    associadoNome,
    formaPagamento: (loc.forma_pagamento_preferida as FormaPagamento) ?? null,
    motivoEncerramento: loc.motivo_encerramento ?? null,
    criadoPorNome: loc.criado_por
      ? (nomes.get(loc.criado_por) ?? "Associado")
      : null,
    criadoEmUtc: loc.criado_em,
    valorSalasCentavos: loc.valor_salas_centavos,
    valorCoffeeCentavos: loc.valor_coffee_centavos,
    valorAdicionaisCentavos: loc.valor_adicionais_centavos,
    valorDescontosCentavos: loc.valor_descontos_centavos,
    valorTotalCentavos: loc.valor_total_centavos,
    periodoGratuitoAplicado: loc.periodo_gratuito_aplicado,
    salas,
    adicionais,
    eventos,
    coffee,
    contrato,
    pagamentos,
  };
}

/**
 * Descreve o ocupante bloqueante que barrou uma aprovação/reagendamento (23P01),
 * para a mensagem amigável (§2.4). Reaproveita a RPC da agenda.
 */
export async function descreverConflitoAgenda(
  locacaoId: string,
  inicioUtc: string,
  fimUtc: string,
): Promise<string> {
  const admin = createAdminClient();
  const { data: ls } = await admin
    .from("locacao_salas")
    .select("sala_id")
    .eq("locacao_id", locacaoId);
  const salaIds = new Set((ls ?? []).map((r) => r.sala_id as string));

  const { data: itens } = await admin.rpc("agenda_no_intervalo", {
    p_inicio: inicioUtc,
    p_fim: fimUtc,
  });

  type Item = {
    sala_id: string;
    sala_nome: string;
    inicio: string;
    fim: string;
    origem: "locacao" | "evento_interno" | "bloqueio";
    bloqueante: boolean;
    locacao_id: string | null;
    locacao_numero: number | null;
    locatario: string | null;
    evento_titulo: string | null;
    motivo: string | null;
  };

  const ocupante = ((itens ?? []) as Item[]).find(
    (i) => salaIds.has(i.sala_id) && i.bloqueante && i.locacao_id !== locacaoId,
  );

  const base =
    "Horário já ocupado nesse período. Reagende, recuse ou use a lista de espera.";
  if (!ocupante) return base;

  let quem: string;
  if (ocupante.origem === "locacao") {
    const loc = `LOC-${String(ocupante.locacao_numero ?? 0).padStart(6, "0")}`;
    quem = `${loc} — ${ocupante.locatario ?? "locatário"}`;
  } else if (ocupante.origem === "evento_interno") {
    quem = `evento “${ocupante.evento_titulo ?? "ACIMM"}”`;
  } else {
    quem = `bloqueio “${ocupante.motivo ?? "sem motivo"}”`;
  }

  return `${ocupante.sala_nome} já ocupada em ${intervaloSP(ocupante.inicio, ocupante.fim)} por ${quem}. Reagende, recuse ou use a lista de espera.`;
}
