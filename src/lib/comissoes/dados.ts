import "server-only";
import { utcParaNaiveSP } from "@/lib/calendario/tempo";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  comissoesDevidas,
  competenciaDoMes,
  type ConfigComissoes,
  mesRelativo,
  type OrigemComissao,
  parsearConfigComissoes,
} from "./comissoes-core";
import type {
  ComissaoLinha,
  TotaisVisao,
  VisaoComissao,
} from "./tipos";

export type { ComissaoLinha, TotaisVisao, VisaoComissao } from "./tipos";
export { VISOES_COMISSAO } from "./tipos";

/**
 * Leitura das comissões para a tela `/admin/comissoes` (Ciclo 2 / Spec 29 §5).
 * A régua é temporal: a competência é o mês da QUITAÇÃO e o pagamento ao
 * colaborador é no mês seguinte. Daí as três visões:
 *  - a_pagar     → linhas reais a pagar neste mês (quitadas até o mês anterior);
 *  - proximo_mes → quitadas neste mês (reais) + previsões de quitação neste mês;
 *  - dois_meses  → previsões de quitação no próximo mês (boleto de mensalidade).
 * As previsões são calculadas na hora dos pagamentos pendentes + config atual e
 * NUNCA gravam em `comissoes`.
 */

export interface FiltrosComissoes {
  origem: OrigemComissao | null;
  busca: string | null;
}

export interface VisaoComissoesDados {
  visao: VisaoComissao;
  linhas: ComissaoLinha[];
  totais: TotaisVisao;
  /** Mês em que estas comissões são pagas ao colaborador ('YYYY-MM'). */
  mesPagamento: string;
  /** true nas visões de previsão (linhas são estimativas). */
  ehPrevisao: boolean;
}

export interface ReconciliacaoComissoes {
  /** Locações com recebimento real e sem comissão viva para origem ativa. */
  pendentes: { locacaoId: string; numero: number }[];
  /** Locações com comissão gerada e algum pagamento isento (revisão manual). */
  revisaoParcial: { locacaoId: string; numero: number }[];
}

// Backstop de volume (comissões são ~2 por locação confirmada).
const LIMITE = 4000;

function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function nomesDeSalas(rel: unknown): string[] {
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

/** Mês corrente 'YYYY-MM' em São Paulo. */
export function mesCorrenteSP(): string {
  return utcParaNaiveSP(new Date().toISOString()).slice(0, 7);
}

/** Resolve ids de locação por LOC-nº / nome / documento / código do associado. */
async function idsPorBusca(busca: string): Promise<string[]> {
  const admin = createAdminClient();
  const b = busca.trim().replace(/[,()]/g, " ");
  const ors = [
    `locatario_nome.ilike.%${b}%`,
    `locatario_documento.ilike.%${b}%`,
  ];
  const num = Number.parseInt(b.replace(/\D/g, ""), 10);
  if (!Number.isNaN(num)) ors.push(`numero.eq.${num}`);
  const { data } = await admin.from("locacoes").select("id").or(ors.join(","));
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

const SELECT_LOC =
  `numero, locatario_nome, locatario_documento,
   locacao_salas ( salas ( nome ) )`;

interface LocRel {
  numero?: number;
  locatario_nome?: string;
  locatario_documento?: string;
  locacao_salas?: unknown;
}

/** Linhas reais (gravadas) num intervalo de competência [de, ate] inclusive. */
async function carregarReais(
  competenciaDe: string | null,
  competenciaAte: string | null,
  origem: OrigemComissao | null,
  idsBusca: string[] | null,
): Promise<ComissaoLinha[]> {
  const admin = createAdminClient();

  let q = admin
    .from("comissoes")
    .select(
      `id, locacao_id, origem, base_centavos, valor_centavos, percentual,
       competencia, recebido_em, forma_pagamento, pago,
       locacoes ( ${SELECT_LOC} )`,
    )
    .is("estornada_em", null);

  if (competenciaDe) q = q.gte("competencia", competenciaDoMes(competenciaDe));
  if (competenciaAte) q = q.lte("competencia", competenciaDoMes(competenciaAte));
  if (origem) q = q.eq("origem", origem);
  if (idsBusca) q = q.in("locacao_id", idsBusca);

  q = q
    .order("competencia", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(LIMITE);

  const { data } = await q;

  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const loc = um(r.locacoes as unknown) as LocRel | null;
    return {
      tipo: "real" as const,
      id: r.id as string,
      locacaoId: r.locacao_id as string,
      numero: loc?.numero ?? 0,
      locatario: loc?.locatario_nome ?? "—",
      documento: loc?.locatario_documento ?? "",
      salas: nomesDeSalas(loc?.locacao_salas),
      origem: r.origem as OrigemComissao,
      baseCentavos: (r.base_centavos as number) ?? 0,
      valorCentavos: (r.valor_centavos as number) ?? 0,
      percentual: Number(r.percentual ?? 0),
      competencia: String(r.competencia).slice(0, 7),
      recebidoEmUtc: (r.recebido_em as string | null) ?? null,
      formaPagamento: (r.forma_pagamento as string | null) ?? null,
      pago: r.pago === true,
    };
  });
}

/**
 * Projeções de comissão para `mesAlvo`: pagamentos pendentes com
 * `previsao_recebimento` no mês, agrupados por locação, exceto locações que já
 * têm comissão viva (essas viram linha real). Calculadas com a config ATUAL.
 */
async function projetarComissoes(
  mesAlvo: string,
  cfg: ConfigComissoes,
  origem: OrigemComissao | null,
  idsBusca: string[] | null,
): Promise<ComissaoLinha[]> {
  const admin = createAdminClient();

  const inicio = competenciaDoMes(mesAlvo);
  const fimExcl = competenciaDoMes(mesRelativo(mesAlvo, 1));

  const { data: comRows } = await admin
    .from("comissoes")
    .select("locacao_id")
    .is("estornada_em", null);
  const jaTemComissao = new Set(
    ((comRows ?? []) as { locacao_id: string }[]).map((r) => r.locacao_id),
  );

  let q = admin
    .from("pagamentos")
    .select(
      `locacao_id, forma, previsao_recebimento,
       locacoes ( ${SELECT_LOC}, valor_salas_centavos, valor_descontos_centavos,
                  valor_coffee_centavos, valor_total_centavos )`,
    )
    .eq("status", "pendente")
    .gte("previsao_recebimento", inicio)
    .lt("previsao_recebimento", fimExcl)
    .limit(LIMITE);
  if (idsBusca) q = q.in("locacao_id", idsBusca);

  const { data } = await q;

  // Uma projeção por locação (a comissão nasce na quitação total, não por item).
  const porLocacao = new Map<string, Record<string, unknown>>();
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const locId = r.locacao_id as string;
    if (jaTemComissao.has(locId)) continue;
    if (!porLocacao.has(locId)) porLocacao.set(locId, r);
  }

  const linhas: ComissaoLinha[] = [];
  for (const [locId, r] of porLocacao) {
    const loc = um(r.locacoes as unknown) as
      | (LocRel & {
          valor_salas_centavos?: number;
          valor_descontos_centavos?: number;
          valor_coffee_centavos?: number;
          valor_total_centavos?: number;
        })
      | null;
    if (!loc || (loc.valor_total_centavos ?? 0) === 0) continue;

    const devidas = comissoesDevidas(cfg, {
      valorSalasCentavos: loc.valor_salas_centavos ?? 0,
      valorDescontosCentavos: loc.valor_descontos_centavos ?? 0,
      valorAdicionaisCentavos: 0,
      valorCoffeeCentavos: loc.valor_coffee_centavos ?? 0,
    });

    for (const d of devidas) {
      if (origem && d.origem !== origem) continue;
      linhas.push({
        tipo: "previsao",
        id: `${locId}:${d.origem}`,
        locacaoId: locId,
        numero: loc.numero ?? 0,
        locatario: loc.locatario_nome ?? "—",
        documento: loc.locatario_documento ?? "",
        salas: nomesDeSalas(loc.locacao_salas),
        origem: d.origem,
        baseCentavos: d.baseCentavos,
        valorCentavos: d.valorCentavos,
        percentual: d.percentual,
        competencia: mesAlvo,
        recebidoEmUtc: null,
        formaPagamento: (r.forma as string | null) ?? null,
        pago: false,
      });
    }
  }
  return linhas;
}

function totalizar(linhas: ComissaoLinha[]): TotaisVisao {
  const t: TotaisVisao = {
    geral: 0,
    locacao: 0,
    coffee: 0,
    naoPagoCentavos: 0,
    pagoCentavos: 0,
    qtd: linhas.length,
  };
  for (const l of linhas) {
    t.geral += l.valorCentavos;
    t[l.origem] += l.valorCentavos;
    if (l.pago) t.pagoCentavos += l.valorCentavos;
    else t.naoPagoCentavos += l.valorCentavos;
  }
  return t;
}

/** Carrega uma das três visões, montando reais + previsões conforme o caso. */
export async function carregarVisaoComissoes(
  visao: VisaoComissao,
  filtros: FiltrosComissoes,
): Promise<VisaoComissoesDados> {
  let idsBusca: string[] | null = null;
  if (filtros.busca && filtros.busca.trim().length > 0) {
    idsBusca = await idsPorBusca(filtros.busca);
    if (idsBusca.length === 0) {
      return {
        visao,
        linhas: [],
        totais: totalizar([]),
        mesPagamento: mesRelativo(mesCorrenteSP(), 1),
        ehPrevisao: visao !== "a_pagar",
      };
    }
  }

  const mesAtual = mesCorrenteSP();
  const mesAnterior = mesRelativo(mesAtual, -1);
  const mesProximo = mesRelativo(mesAtual, 1);

  let linhas: ComissaoLinha[] = [];
  let ehPrevisao = false;
  let mesPagamento = mesAtual;

  if (visao === "a_pagar") {
    // Quitadas até o mês anterior (inclui atrasadas/retroativas). Pagas neste mês.
    linhas = await carregarReais(null, mesAnterior, filtros.origem, idsBusca);
    mesPagamento = mesAtual;
  } else if (visao === "proximo_mes") {
    const cfg = await lerConfigComissoes();
    const [reais, previstas] = await Promise.all([
      carregarReais(mesAtual, mesAtual, filtros.origem, idsBusca),
      projetarComissoes(mesAtual, cfg, filtros.origem, idsBusca),
    ]);
    linhas = [...reais, ...previstas];
    ehPrevisao = true;
    mesPagamento = mesProximo;
  } else {
    const cfg = await lerConfigComissoes();
    linhas = await projetarComissoes(
      mesProximo,
      cfg,
      filtros.origem,
      idsBusca,
    );
    ehPrevisao = true;
    mesPagamento = mesRelativo(mesAtual, 2);
  }

  return { visao, linhas, totais: totalizar(linhas), mesPagamento, ehPrevisao };
}

/**
 * Reconciliação (§4.3): comissões que deveriam existir mas não existem
 * (efeito best-effort falhou) e locações com isenção parcial a revisar.
 */
export async function carregarReconciliacao(): Promise<ReconciliacaoComissoes> {
  const admin = createAdminClient();
  const cfg = await lerConfigComissoes();
  if (!cfg.locacao.ativo && !cfg.coffee.ativo) {
    return { pendentes: [], revisaoParcial: [] };
  }

  const CONFIRMADAS = ["confirmada", "realizada", "finalizada"];

  const [{ data: confirmadas }, { data: comRows }, { data: pagos }] =
    await Promise.all([
      admin
        .from("locacoes")
        .select("id, numero, valor_total_centavos")
        .in("status", CONFIRMADAS)
        .limit(LIMITE),
      admin.from("comissoes").select("locacao_id").is("estornada_em", null),
      admin
        .from("pagamentos")
        .select("locacao_id, status")
        .in("status", ["pago", "isento"]),
    ]);

  const comComissao = new Set(
    ((comRows ?? []) as { locacao_id: string }[]).map((r) => r.locacao_id),
  );
  const comRecebimento = new Set(
    ((pagos ?? []) as { locacao_id: string; status: string }[])
      .filter((p) => p.status === "pago")
      .map((p) => p.locacao_id),
  );
  const comIsento = new Set(
    ((pagos ?? []) as { locacao_id: string; status: string }[])
      .filter((p) => p.status === "isento")
      .map((p) => p.locacao_id),
  );

  const pendentes: { locacaoId: string; numero: number }[] = [];
  const revisaoParcial: { locacaoId: string; numero: number }[] = [];
  for (const l of (confirmadas ?? []) as {
    id: string;
    numero: number;
    valor_total_centavos: number;
  }[]) {
    if ((l.valor_total_centavos ?? 0) === 0) continue;
    if (comRecebimento.has(l.id) && !comComissao.has(l.id)) {
      pendentes.push({ locacaoId: l.id, numero: l.numero });
    }
    if (comComissao.has(l.id) && comIsento.has(l.id)) {
      revisaoParcial.push({ locacaoId: l.id, numero: l.numero });
    }
  }
  return { pendentes, revisaoParcial };
}

export async function lerConfigComissoes(): Promise<ConfigComissoes> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("configuracoes")
    .select("valor")
    .eq("chave", "comissoes")
    .maybeSingle();
  return parsearConfigComissoes(data?.valor);
}
