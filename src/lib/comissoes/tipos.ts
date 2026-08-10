import type { OrigemComissao } from "./comissoes-core";

/**
 * Tipos serializáveis da tela de comissões (Ciclo 3 / Spec 33). Puros (sem I/O)
 * para poderem ser importados tanto pelo carregador server-only (`dados.ts`)
 * quanto pelos componentes client.
 */

export type VisaoComissao = "a_pagar" | "proximo_mes" | "dois_meses";

export const VISOES_COMISSAO: VisaoComissao[] = [
  "a_pagar",
  "proximo_mes",
  "dois_meses",
];

export const VISAO_ROTULO: Record<VisaoComissao, string> = {
  a_pagar: "A pagar (mês atual)",
  proximo_mes: "Próximo mês",
  dois_meses: "Daqui a dois meses",
};

export interface ComissaoLinha {
  /** 'real' = linha gravada; 'previsao' = projeção não persistida. */
  tipo: "real" | "previsao";
  /** id da comissão (real) ou chave sintética `locacao:origem` (previsão). */
  id: string;
  locacaoId: string;
  numero: number;
  locatario: string;
  documento: string;
  salas: string[];
  origem: OrigemComissao;
  baseCentavos: number;
  valorCentavos: number;
  percentual: number;
  /** 'YYYY-MM' — mês da quitação (real) ou da quitação prevista (previsão). */
  competencia: string;
  /** 'YYYY-MM' quando a linha foi deslocada por competência fechada. */
  competenciaOriginal: string | null;
  /** Competência congelada → a linha não muda mais e já pode ser paga. */
  competenciaFechada: boolean;
  recebidoEmUtc: string | null;
  formaPagamento: string | null;
  pago: boolean;
}

export interface TotaisVisao {
  geral: number;
  locacao: number;
  coffee: number;
  naoPagoCentavos: number;
  pagoCentavos: number;
  qtd: number;
}

/** Apuração de um mês — o percentual é do MÊS, não da linha (Spec 33). */
export interface ApuracaoCompetencia {
  /** 'YYYY-MM'. */
  mes: string;
  baseLocacaoCentavos: number;
  baseCoffeeCentavos: number;
  percentualLocacao: number;
  percentualCoffee: number;
  bonusAplicado: boolean;
  /** SOMA das linhas (nunca floor(base × pct) — ver comissoes-core). */
  totalLocacaoCentavos: number;
  totalCoffeeCentavos: number;
  qtdLinhas: number;
  apuradaEmUtc: string | null;
  fechadaEmUtc: string | null;
  fechadaPorNome: string | null;
  /** Rótulos prontos: "até R$ 10.000,00 → 5%" / "acima de R$ 10.000,00 → 6%". */
  faixaLocacaoRotulo: string | null;
  faixaCoffeeRotulo: string | null;
  /** Quanto falta para bater cada meta do bônus (0 = batida). */
  faltaLocacaoCentavos: number;
  faltaCoffeeCentavos: number;
  metaLocacaoCentavos: number;
  metaCoffeeCentavos: number;
  bonusHabilitado: boolean;
  bonusPercentual: number;
  /** Cabeçalho ainda não gravado (mês sem linhas ou nunca apurado). */
  semRegistro: boolean;
  /** Σ das linhas ≠ totais gravados → apuração desatualizada. */
  divergente: boolean;
}
