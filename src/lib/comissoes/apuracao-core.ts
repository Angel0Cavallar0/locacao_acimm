/**
 * Núcleo PURO da apuração de comissões por metas (Spec 33). Sem I/O.
 *
 * A partir do Ciclo 3 o percentual deixa de ser propriedade da LINHA e passa a
 * ser propriedade da COMPETÊNCIA: as faixas incidem sobre o TOTAL do mês por
 * grupo (locação+adicionais e coffee), com alíquota ÚNICA sobre o total (decisão
 * A — não é progressiva), e um bônus opcional que substitui as duas alíquotas
 * quando as duas metas são batidas (decisão B).
 *
 * Autocontido de propósito (sem imports locais de valor) para rodar sob
 * `node --test` sem resolver módulos do bundler.
 */

export interface Faixa {
  /** Limite SUPERIOR INCLUSIVO em centavos. `null` = faixa sem teto (a última). */
  ateCentavos: number | null;
  /** Percentual inteiro/decimal (ex.: 5 = 5%, 7.5 = 7,5%). */
  percentual: number;
}

export interface RegraGrupo {
  ativo: boolean;
  faixas: Faixa[];
}

export interface RegraBonus {
  ativo: boolean;
  percentual: number;
  metaLocacaoCentavos: number;
  metaCoffeeCentavos: number;
}

export interface ConfigComissoes {
  locacao: RegraGrupo;
  coffee: RegraGrupo;
  bonus: RegraBonus;
}

export interface BasesCompetencia {
  locacaoCentavos: number;
  coffeeCentavos: number;
}

export interface Apuracao {
  percentualLocacao: number;
  percentualCoffee: number;
  bonusAplicado: boolean;
  /** Faixa escolhida — a tela mostra "acima de R$ 10.000,00 → 6%". */
  faixaLocacao: Faixa | null;
  faixaCoffee: Faixa | null;
  /** Quanto falta para BATER a meta (comparação estrita). 0 = já batida. */
  faltaLocacaoCentavos: number;
  faltaCoffeeCentavos: number;
}

const GRUPO_VAZIO: RegraGrupo = { ativo: false, faixas: [] };

export const BONUS_PADRAO: RegraBonus = {
  ativo: false,
  percentual: 0,
  metaLocacaoCentavos: 0,
  metaCoffeeCentavos: 0,
};

export const CONFIG_COMISSOES_PADRAO: ConfigComissoes = {
  locacao: GRUPO_VAZIO,
  coffee: GRUPO_VAZIO,
  bonus: BONUS_PADRAO,
};

function numeroSeguro(v: unknown, minimo: number, maximo: number): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  if (!Number.isFinite(n)) return 0;
  return Math.min(maximo, Math.max(minimo, n));
}

function centavosSeguro(v: unknown): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n);
}

/**
 * Ordena por teto ascendente com a faixa sem teto (`null`) sempre por último.
 * A decisão de faixa depende dessa ordem, então nunca confiar na ordem do JSON.
 */
export function ordenarFaixas(faixas: Faixa[]): Faixa[] {
  return [...faixas].sort((a, b) => {
    if (a.ateCentavos === null) return b.ateCentavos === null ? 0 : 1;
    if (b.ateCentavos === null) return -1;
    return a.ateCentavos - b.ateCentavos;
  });
}

/** Normaliza a lista: ordena, deduplica tetos e mantém uma única faixa aberta. */
function normalizarFaixas(bruto: unknown): Faixa[] {
  if (!Array.isArray(bruto)) return [];

  const lidas: Faixa[] = [];
  for (const item of bruto) {
    if (typeof item !== "object" || item === null) continue;
    const o = item as { ate_centavos?: unknown; percentual?: unknown };
    const teto =
      o.ate_centavos === null || o.ate_centavos === undefined
        ? null
        : centavosSeguro(o.ate_centavos);
    lidas.push({
      ateCentavos: teto,
      percentual: numeroSeguro(o.percentual, 0, 100),
    });
  }

  const ordenadas = ordenarFaixas(lidas);
  const vistos = new Set<number>();
  const saida: Faixa[] = [];
  let abertaUsada = false;

  for (const f of ordenadas) {
    if (f.ateCentavos === null) {
      // Mais de uma faixa aberta é ambíguo: mantém só a última encontrada.
      if (abertaUsada) saida.pop();
      abertaUsada = true;
      saida.push(f);
      continue;
    }
    if (vistos.has(f.ateCentavos)) continue;
    vistos.add(f.ateCentavos);
    saida.push(f);
  }

  return saida;
}

function grupo(v: unknown): RegraGrupo {
  const o = (v ?? {}) as {
    ativo?: unknown;
    faixas?: unknown;
    percentual?: unknown;
  };
  const ativo = o.ativo === true;

  if (Array.isArray(o.faixas)) {
    const faixas = normalizarFaixas(o.faixas);
    if (faixas.length === 0) return GRUPO_VAZIO;
    return { ativo, faixas };
  }

  // Formato LEGADO (Spec 21/29): percentual escalar. Uma faixa única sem teto é
  // matematicamente idêntica ao comportamento antigo — garante que o código novo
  // continue gerando comissões se a migration ainda não tiver rodado.
  if (o.percentual !== undefined && o.percentual !== null) {
    return {
      ativo,
      faixas: [
        { ateCentavos: null, percentual: numeroSeguro(o.percentual, 0, 100) },
      ],
    };
  }

  return GRUPO_VAZIO;
}

function bonus(v: unknown): RegraBonus {
  if (typeof v !== "object" || v === null) return BONUS_PADRAO;
  const o = v as {
    ativo?: unknown;
    percentual?: unknown;
    meta_locacao_centavos?: unknown;
    meta_coffee_centavos?: unknown;
  };
  return {
    ativo: o.ativo === true,
    percentual: numeroSeguro(o.percentual, 0, 100),
    metaLocacaoCentavos: centavosSeguro(o.meta_locacao_centavos),
    metaCoffeeCentavos: centavosSeguro(o.meta_coffee_centavos),
  };
}

/**
 * Interpreta `configuracoes.comissoes` com defaults tolerantes. Aceita o formato
 * v2 (faixas) e o LEGADO (percentual escalar). Bônus nunca é herdado do legado.
 */
export function parsearConfigComissoes(valor: unknown): ConfigComissoes {
  const o = (valor ?? {}) as {
    locacao?: unknown;
    coffee?: unknown;
    bonus?: unknown;
  };
  return {
    locacao: grupo(o.locacao),
    coffee: grupo(o.coffee),
    bonus: bonus(o.bonus),
  };
}

/** Espelho do parse: serializa em snake_case para gravar no jsonb. */
export function serializarConfigComissoes(
  cfg: ConfigComissoes,
): Record<string, unknown> {
  const grupoJson = (g: RegraGrupo) => ({
    ativo: g.ativo,
    faixas: ordenarFaixas(g.faixas).map((f) => ({
      ate_centavos: f.ateCentavos,
      percentual: f.percentual,
    })),
  });

  return {
    versao: 2,
    locacao: grupoJson(cfg.locacao),
    coffee: grupoJson(cfg.coffee),
    bonus: {
      ativo: cfg.bonus.ativo,
      percentual: cfg.bonus.percentual,
      meta_locacao_centavos: cfg.bonus.metaLocacaoCentavos,
      meta_coffee_centavos: cfg.bonus.metaCoffeeCentavos,
    },
  };
}

/**
 * Faixa aplicável ao total do mês. Teto é INCLUSIVO ("até R$ 10.000" cobre
 * exatamente 10.000). Sem faixa que cubra → null (percentual 0).
 */
export function faixaDoTotal(
  faixas: Faixa[],
  totalCentavos: number,
): Faixa | null {
  const ordenadas = ordenarFaixas(faixas);
  for (const f of ordenadas) {
    if (f.ateCentavos === null || totalCentavos <= f.ateCentavos) return f;
  }
  return null;
}

export function percentualDaFaixa(
  faixas: Faixa[],
  totalCentavos: number,
): number {
  return faixaDoTotal(faixas, totalCentavos)?.percentual ?? 0;
}

/**
 * Quanto falta para BATER a meta. A comparação é ESTRITA ("acima de R$ 10.000"),
 * então na igualdade ainda falta 1 centavo.
 */
export function faltaParaMeta(
  baseCentavos: number,
  metaCentavos: number,
): number {
  return baseCentavos > metaCentavos ? 0 : metaCentavos - baseCentavos + 1;
}

/** As DUAS metas batidas (estritamente acima) com o bônus habilitado. */
export function metasBatidas(
  bonusCfg: RegraBonus,
  bases: BasesCompetencia,
): boolean {
  return (
    bases.locacaoCentavos > bonusCfg.metaLocacaoCentavos &&
    bases.coffeeCentavos > bonusCfg.metaCoffeeCentavos
  );
}

/**
 * Apura a competência: faixa de cada grupo sobre o total do mês e, quando as duas
 * metas são batidas, o bônus SUBSTITUI as duas alíquotas (decisão B).
 *
 * O bônus exige os DOIS grupos ativos: com coffee desligado não existe "meta de
 * coffee batida" que faça sentido premiar. E ele substitui mesmo se for MENOR que
 * a faixa alta — sem `Math.max` silencioso, que mascararia erro de configuração
 * (a tela avisa o admin nesse caso).
 */
export function apurarCompetencia(
  cfg: ConfigComissoes,
  bases: BasesCompetencia,
): Apuracao {
  const faixaLocacao = cfg.locacao.ativo
    ? faixaDoTotal(cfg.locacao.faixas, bases.locacaoCentavos)
    : null;
  const faixaCoffee = cfg.coffee.ativo
    ? faixaDoTotal(cfg.coffee.faixas, bases.coffeeCentavos)
    : null;

  let percentualLocacao = faixaLocacao?.percentual ?? 0;
  let percentualCoffee = faixaCoffee?.percentual ?? 0;

  const elegivel =
    cfg.bonus.ativo &&
    cfg.bonus.percentual > 0 &&
    cfg.locacao.ativo &&
    cfg.coffee.ativo;
  const bonusAplicado = elegivel && metasBatidas(cfg.bonus, bases);

  if (bonusAplicado) {
    percentualLocacao = cfg.bonus.percentual;
    percentualCoffee = cfg.bonus.percentual;
  }

  return {
    percentualLocacao,
    percentualCoffee,
    bonusAplicado,
    faixaLocacao,
    faixaCoffee,
    faltaLocacaoCentavos: faltaParaMeta(
      bases.locacaoCentavos,
      cfg.bonus.metaLocacaoCentavos,
    ),
    faltaCoffeeCentavos: faltaParaMeta(
      bases.coffeeCentavos,
      cfg.bonus.metaCoffeeCentavos,
    ),
  };
}

/** Maior percentual configurado — a tela usa para avisar bônus menor que a faixa. */
export function maiorPercentualConfigurado(cfg: ConfigComissoes): number {
  const todos = [
    ...(cfg.locacao.ativo ? cfg.locacao.faixas : []),
    ...(cfg.coffee.ativo ? cfg.coffee.faixas : []),
  ].map((f) => f.percentual);
  return todos.length > 0 ? Math.max(...todos) : 0;
}
