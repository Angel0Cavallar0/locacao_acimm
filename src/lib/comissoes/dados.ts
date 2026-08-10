import "server-only";
import { utcParaNaiveSP } from "@/lib/calendario/tempo";
import { createAdminClient } from "@/lib/supabase/admin";
import { centavosParaBRL } from "@/lib/utils/moeda";
import {
  apurarCompetencia,
  type ConfigComissoes,
  type Faixa,
  ordenarFaixas,
  parsearConfigComissoes,
  percentualDaFaixa,
} from "./apuracao-core";
import {
  basesDevidas,
  competenciaDoMes,
  mesRelativo,
  type OrigemComissao,
  valorComissao,
} from "./comissoes-core";
import type {
  ApuracaoCompetencia,
  ComissaoLinha,
  TotaisVisao,
  VisaoComissao,
} from "./tipos";

export type {
  ApuracaoCompetencia,
  ComissaoLinha,
  TotaisVisao,
  VisaoComissao,
} from "./tipos";
export { VISOES_COMISSAO } from "./tipos";

/**
 * Leitura das comissões para a tela `/admin/comissoes` (Ciclo 3 / Spec 33).
 *
 * A régua é temporal: a competência é o mês do RECEBIMENTO e o pagamento ao
 * colaborador é no mês seguinte. Daí as três visões:
 *  - a_pagar     → linhas reais a pagar neste mês (recebidas até o mês anterior);
 *  - proximo_mes → recebidas neste mês (reais) + previsões para este mês;
 *  - dois_meses  → previsões de recebimento no próximo mês.
 * As previsões saem de `locacoes.mes_recebimento` e NUNCA gravam em `comissoes`.
 *
 * O percentual é do MÊS (faixa sobre o total da competência), então as previsões
 * projetam a faixa do mês inteiro — reais já gravadas + previstas.
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
  /**
   * Locações com comissão gerada e adicional sem valor (sob consulta não cotado).
   * Ciclo 3: adicionais entram na base, então um R$ 0 esquecido pode derrubar a
   * faixa do mês inteiro.
   */
  adicionalSemValor: { locacaoId: string; numero: number }[];
}

// Backstop de volume (comissões são ~2 por locação confirmada).
const LIMITE = 4000;

/** Status em que a locação ainda vai receber (alimenta as previsões). */
const STATUS_A_RECEBER = [
  "aprovada",
  "contrato_enviado",
  "contrato_assinado",
  "aguardando_pagamento",
];

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

/** Competências congeladas ('YYYY-MM-01'). Usada por geração e apuração. */
export async function competenciasFechadas(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("comissao_competencias")
    .select("competencia")
    .not("fechada_em", "is", null);
  return ((data ?? []) as { competencia: string }[]).map((r) =>
    String(r.competencia).slice(0, 10),
  );
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
       competencia, competencia_original, recebido_em, forma_pagamento, pago,
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

  const [{ data }, fechadas] = await Promise.all([q, competenciasFechadas()]);
  const travadas = new Set(fechadas);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const loc = um(r.locacoes as unknown) as LocRel | null;
    const comp = String(r.competencia).slice(0, 10);
    const original = r.competencia_original as string | null;
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
      competencia: comp.slice(0, 7),
      competenciaOriginal: original ? String(original).slice(0, 7) : null,
      competenciaFechada: travadas.has(comp),
      recebidoEmUtc: (r.recebido_em as string | null) ?? null,
      formaPagamento: (r.forma_pagamento as string | null) ?? null,
      pago: r.pago === true,
    };
  });
}

/** Soma das bases já GRAVADAS (linhas vivas) de uma competência, por origem. */
async function basesReaisDaCompetencia(
  competencia: string,
): Promise<{ locacaoCentavos: number; coffeeCentavos: number }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("comissoes")
    .select("origem, base_centavos")
    .eq("competencia", competencia)
    .is("estornada_em", null);

  let locacaoCentavos = 0;
  let coffeeCentavos = 0;
  for (const r of (data ?? []) as {
    origem: OrigemComissao;
    base_centavos: number;
  }[]) {
    if (r.origem === "locacao") locacaoCentavos += r.base_centavos ?? 0;
    else coffeeCentavos += r.base_centavos ?? 0;
  }
  return { locacaoCentavos, coffeeCentavos };
}

/**
 * Projeções para `mesAlvo` a partir de `locacoes.mes_recebimento` (Spec 33 §9.3).
 *
 * Substitui a fonte antiga (`pagamentos.previsao_recebimento`), que nunca chegou
 * a ser escrita por código algum — as duas visões de previsão viviam vazias.
 * A faixa projetada considera o MÊS INTEIRO (reais + previstas): a pergunta útil
 * é "se tudo previsto entrar, o mês vai a 6%?".
 */
async function projetarComissoes(
  mesAlvo: string,
  cfg: ConfigComissoes,
  origem: OrigemComissao | null,
  idsBusca: string[] | null,
): Promise<ComissaoLinha[]> {
  const admin = createAdminClient();
  const competencia = competenciaDoMes(mesAlvo);

  const { data: comRows } = await admin
    .from("comissoes")
    .select("locacao_id")
    .is("estornada_em", null);
  const jaTemComissao = new Set(
    ((comRows ?? []) as { locacao_id: string }[]).map((r) => r.locacao_id),
  );

  let q = admin
    .from("locacoes")
    .select(
      `id, ${SELECT_LOC}, valor_salas_centavos, valor_descontos_centavos,
       valor_adicionais_centavos, valor_coffee_centavos, valor_total_centavos,
       forma_pagamento_preferida`,
    )
    .eq("mes_recebimento", competencia)
    .in("status", STATUS_A_RECEBER)
    .gt("valor_total_centavos", 0)
    .limit(LIMITE);
  if (idsBusca) q = q.in("id", idsBusca);

  const [{ data }, reais] = await Promise.all([
    q,
    basesReaisDaCompetencia(competencia),
  ]);

  interface LinhaPrevista {
    locId: string;
    loc: LocRel & { forma_pagamento_preferida?: string | null };
    origem: OrigemComissao;
    baseCentavos: number;
  }

  const previstas: LinhaPrevista[] = [];
  let totalLocacao = reais.locacaoCentavos;
  let totalCoffee = reais.coffeeCentavos;

  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const locId = r.id as string;
    if (jaTemComissao.has(locId)) continue;

    const bases = basesDevidas(cfg, {
      valorSalasCentavos: (r.valor_salas_centavos as number) ?? 0,
      valorDescontosCentavos: (r.valor_descontos_centavos as number) ?? 0,
      valorAdicionaisCentavos: (r.valor_adicionais_centavos as number) ?? 0,
      valorCoffeeCentavos: (r.valor_coffee_centavos as number) ?? 0,
    });

    for (const b of bases) {
      if (b.origem === "locacao") totalLocacao += b.baseCentavos;
      else totalCoffee += b.baseCentavos;
      previstas.push({
        locId,
        loc: r as unknown as LinhaPrevista["loc"],
        origem: b.origem,
        baseCentavos: b.baseCentavos,
      });
    }
  }

  // Faixa do mês INTEIRO (reais + previstas), com o bônus quando as metas batem.
  const projetada = apurarCompetencia(cfg, {
    locacaoCentavos: totalLocacao,
    coffeeCentavos: totalCoffee,
  });

  const linhas: ComissaoLinha[] = [];
  for (const p of previstas) {
    if (origem && p.origem !== origem) continue;
    const pct =
      p.origem === "locacao"
        ? projetada.percentualLocacao
        : projetada.percentualCoffee;
    linhas.push({
      tipo: "previsao",
      id: `${p.locId}:${p.origem}`,
      locacaoId: p.locId,
      numero: p.loc.numero ?? 0,
      locatario: p.loc.locatario_nome ?? "—",
      documento: p.loc.locatario_documento ?? "",
      salas: nomesDeSalas(p.loc.locacao_salas),
      origem: p.origem,
      baseCentavos: p.baseCentavos,
      valorCentavos: valorComissao(p.baseCentavos, pct),
      percentual: pct,
      competencia: mesAlvo,
      competenciaOriginal: null,
      competenciaFechada: false,
      recebidoEmUtc: null,
      formaPagamento: p.loc.forma_pagamento_preferida ?? null,
      pago: false,
    });
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
    // Recebidas até o mês anterior (inclui atrasadas/retroativas). Pagas neste mês.
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

/** "até R$ 10.000,00 → 5%" / "acima de R$ 10.000,00 → 6%". */
function rotuloFaixa(faixas: Faixa[], escolhida: Faixa | null): string | null {
  if (!escolhida) return null;
  const pct = `${escolhida.percentual}%`;
  if (escolhida.ateCentavos !== null) {
    return `até ${centavosParaBRL(escolhida.ateCentavos)} → ${pct}`;
  }
  const tetos = ordenarFaixas(faixas)
    .map((f) => f.ateCentavos)
    .filter((t): t is number => t !== null);
  const maior = tetos.length > 0 ? tetos[tetos.length - 1] : null;
  return maior === null
    ? `qualquer valor → ${pct}`
    : `acima de ${centavosParaBRL(maior)} → ${pct}`;
}

/**
 * Apuração de um mês para o painel. Lê o cabeçalho gravado e recomputa a faixa
 * a partir das linhas vivas — a divergência entre os dois é o sinal de que a
 * apuração ficou para trás (efeito best-effort que falhou).
 */
export async function carregarApuracao(
  mes: string,
): Promise<ApuracaoCompetencia> {
  const admin = createAdminClient();
  const competencia = competenciaDoMes(mes);

  const [cfg, { data: cab }, bases, { data: linhasVivas }] = await Promise.all([
    lerConfigComissoes(),
    admin
      .from("comissao_competencias")
      .select(
        `competencia, base_locacao_centavos, base_coffee_centavos,
         percentual_locacao, percentual_coffee, bonus_aplicado,
         total_locacao_centavos, total_coffee_centavos, qtd_linhas,
         apurada_em, fechada_em, fechada_por`,
      )
      .eq("competencia", competencia)
      .maybeSingle(),
    basesReaisDaCompetencia(competencia),
    admin
      .from("comissoes")
      .select("origem, valor_centavos")
      .eq("competencia", competencia)
      .is("estornada_em", null),
  ]);

  const viva = apurarCompetencia(cfg, bases);

  let somaLocacao = 0;
  let somaCoffee = 0;
  for (const r of (linhasVivas ?? []) as {
    origem: OrigemComissao;
    valor_centavos: number;
  }[]) {
    if (r.origem === "locacao") somaLocacao += r.valor_centavos ?? 0;
    else somaCoffee += r.valor_centavos ?? 0;
  }

  let fechadaPorNome: string | null = null;
  const fechadaPor = (cab?.fechada_por as string | null) ?? null;
  if (fechadaPor) {
    const { data: colab } = await admin
      .from("colaboradores")
      .select("nome")
      .eq("user_id", fechadaPor)
      .maybeSingle();
    fechadaPorNome = (colab?.nome as string | null) ?? "ACIMM";
  }

  const fechada = (cab?.fechada_em as string | null) ?? null;
  const semRegistro = !cab;

  // Fechada: a autoridade é o cabeçalho congelado. Aberta: a faixa recomputada.
  const percentualLocacao = fechada
    ? Number(cab?.percentual_locacao ?? 0)
    : viva.percentualLocacao;
  const percentualCoffee = fechada
    ? Number(cab?.percentual_coffee ?? 0)
    : viva.percentualCoffee;

  const divergente =
    !fechada &&
    !semRegistro &&
    (somaLocacao !== ((cab?.total_locacao_centavos as number) ?? 0) ||
      somaCoffee !== ((cab?.total_coffee_centavos as number) ?? 0) ||
      Number(cab?.percentual_locacao ?? 0) !== viva.percentualLocacao ||
      Number(cab?.percentual_coffee ?? 0) !== viva.percentualCoffee);

  return {
    mes,
    baseLocacaoCentavos: bases.locacaoCentavos,
    baseCoffeeCentavos: bases.coffeeCentavos,
    percentualLocacao,
    percentualCoffee,
    bonusAplicado: fechada
      ? cab?.bonus_aplicado === true
      : viva.bonusAplicado,
    totalLocacaoCentavos: somaLocacao,
    totalCoffeeCentavos: somaCoffee,
    qtdLinhas: (linhasVivas ?? []).length,
    apuradaEmUtc: (cab?.apurada_em as string | null) ?? null,
    fechadaEmUtc: fechada,
    fechadaPorNome,
    faixaLocacaoRotulo: rotuloFaixa(cfg.locacao.faixas, viva.faixaLocacao),
    faixaCoffeeRotulo: rotuloFaixa(cfg.coffee.faixas, viva.faixaCoffee),
    faltaLocacaoCentavos: viva.faltaLocacaoCentavos,
    faltaCoffeeCentavos: viva.faltaCoffeeCentavos,
    metaLocacaoCentavos: cfg.bonus.metaLocacaoCentavos,
    metaCoffeeCentavos: cfg.bonus.metaCoffeeCentavos,
    bonusHabilitado: cfg.bonus.ativo,
    bonusPercentual: cfg.bonus.percentual,
    semRegistro,
    divergente,
  };
}

/**
 * Reconciliação: comissões que deveriam existir mas não existem (efeito
 * best-effort falhou), isenção parcial a revisar e — novo no Ciclo 3 — adicional
 * sem valor, que agora entra na base e pode derrubar a faixa do mês.
 */
export async function carregarReconciliacao(): Promise<ReconciliacaoComissoes> {
  const admin = createAdminClient();
  const cfg = await lerConfigComissoes();
  if (!cfg.locacao.ativo && !cfg.coffee.ativo) {
    return { pendentes: [], revisaoParcial: [], adicionalSemValor: [] };
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

  // Adicional cadastrado sem valor (sob consulta não cotado): entra como R$ 0 na
  // base da locação e pode fazer o mês inteiro cair de faixa.
  let semValor = new Set<string>();
  if (comComissao.size > 0) {
    const { data: adicionais } = await admin
      .from("locacao_adicionais")
      .select("locacao_id")
      .eq("valor_unitario_centavos", 0)
      .in("locacao_id", [...comComissao]);
    semValor = new Set(
      ((adicionais ?? []) as { locacao_id: string }[]).map((r) => r.locacao_id),
    );
  }

  const pendentes: { locacaoId: string; numero: number }[] = [];
  const revisaoParcial: { locacaoId: string; numero: number }[] = [];
  const adicionalSemValor: { locacaoId: string; numero: number }[] = [];
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
    if (semValor.has(l.id)) {
      adicionalSemValor.push({ locacaoId: l.id, numero: l.numero });
    }
  }
  return { pendentes, revisaoParcial, adicionalSemValor };
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

/** Percentual provisório de uma origem, dado o que já existe na competência. */
export async function percentualProvisorio(
  competencia: string,
  cfg: ConfigComissoes,
  acrescimo: { locacaoCentavos: number; coffeeCentavos: number },
): Promise<{ locacao: number; coffee: number }> {
  const bases = await basesReaisDaCompetencia(competencia);
  return {
    locacao: cfg.locacao.ativo
      ? percentualDaFaixa(
          cfg.locacao.faixas,
          bases.locacaoCentavos + acrescimo.locacaoCentavos,
        )
      : 0,
    coffee: cfg.coffee.ativo
      ? percentualDaFaixa(
          cfg.coffee.faixas,
          bases.coffeeCentavos + acrescimo.coffeeCentavos,
        )
      : 0,
  };
}
