import type { OrigemComissao } from "./comissoes-core";

/**
 * Tipos serializáveis da tela de comissões (Ciclo 2 / Spec 29). Puros (sem I/O)
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
