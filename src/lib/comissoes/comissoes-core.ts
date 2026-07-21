/**
 * Núcleo PURO das comissões (Spec 21 §3). Sem I/O — recebe a config já lida e as
 * bases já apuradas. A geração (geracao.ts) e a tela (dados.ts) consomem daqui.
 * Testado com node:test; evita import de valor entre módulos locais.
 */

export type OrigemComissao = "locacao" | "coffee";

export interface RegraOrigem {
  ativo: boolean;
  /** Percentual inteiro/decimal (ex.: 5 = 5%, 7.5 = 7,5%). */
  percentual: number;
}

export interface ConfigComissoes {
  locacao: RegraOrigem;
  coffee: RegraOrigem;
}

export const CONFIG_COMISSOES_PADRAO: ConfigComissoes = {
  locacao: { ativo: false, percentual: 0 },
  coffee: { ativo: false, percentual: 0 },
};

/** Bases (centavos) vindas da locação já confirmada — congeladas no snapshot. */
export interface BasesLocacao {
  valorSalasCentavos: number;
  valorDescontosCentavos: number;
  valorAdicionaisCentavos: number;
  valorCoffeeCentavos: number;
}

export interface LinhaComissaoDevida {
  origem: OrigemComissao;
  baseCentavos: number;
  percentual: number;
  valorCentavos: number;
}

function numeroSeguro(v: unknown, minimo: number, maximo: number): number {
  const n = typeof v === "number" ? v : Number.parseFloat(String(v));
  if (!Number.isFinite(n)) return 0;
  return Math.min(maximo, Math.max(minimo, n));
}

function regra(v: unknown): RegraOrigem {
  const o = (v ?? {}) as { ativo?: unknown; percentual?: unknown };
  return {
    ativo: o.ativo === true,
    percentual: numeroSeguro(o.percentual, 0, 100),
  };
}

/** Interpreta o JSON de `configuracoes.comissoes` com defaults tolerantes. */
export function parsearConfigComissoes(valor: unknown): ConfigComissoes {
  const o = (valor ?? {}) as { locacao?: unknown; coffee?: unknown };
  return { locacao: regra(o.locacao), coffee: regra(o.coffee) };
}

/**
 * Valor da comissão: percentual da base, arredondado PARA BAIXO no centavo
 * (§3). Base ou percentual não-positivos → 0 (não gera linha).
 */
export function valorComissao(baseCentavos: number, percentual: number): number {
  if (baseCentavos <= 0 || percentual <= 0) return 0;
  return Math.floor((baseCentavos * percentual) / 100);
}

/**
 * Base da locação: valor das salas LÍQUIDO de descontos de sala + adicionais
 * (§3). Todos os descontos do sistema são de sala (multi-sala/período gratuito),
 * então `valor_descontos_centavos` é a dedução correta. Nunca negativa.
 */
export function baseLocacao(bases: BasesLocacao): number {
  return Math.max(
    0,
    bases.valorSalasCentavos -
      bases.valorDescontosCentavos +
      bases.valorAdicionaisCentavos,
  );
}

/**
 * Linhas de comissão devidas por uma locação confirmada. Só origens ativas,
 * base > 0 e valor > 0 geram linha (sem lixo). Coffee só quando há coffee.
 */
export function comissoesDevidas(
  cfg: ConfigComissoes,
  bases: BasesLocacao,
): LinhaComissaoDevida[] {
  const linhas: LinhaComissaoDevida[] = [];

  if (cfg.locacao.ativo && cfg.locacao.percentual > 0) {
    const base = baseLocacao(bases);
    const valor = valorComissao(base, cfg.locacao.percentual);
    if (valor > 0) {
      linhas.push({
        origem: "locacao",
        baseCentavos: base,
        percentual: cfg.locacao.percentual,
        valorCentavos: valor,
      });
    }
  }

  if (
    cfg.coffee.ativo &&
    cfg.coffee.percentual > 0 &&
    bases.valorCoffeeCentavos > 0
  ) {
    const base = bases.valorCoffeeCentavos;
    const valor = valorComissao(base, cfg.coffee.percentual);
    if (valor > 0) {
      linhas.push({
        origem: "coffee",
        baseCentavos: base,
        percentual: cfg.coffee.percentual,
        valorCentavos: valor,
      });
    }
  }

  return linhas;
}
