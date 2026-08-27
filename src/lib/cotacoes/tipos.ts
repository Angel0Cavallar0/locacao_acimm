import type { CondicaoLocatario, PeriodoDia } from "@/lib/dominio";

/** Tipos de cotação de aluguel (orçamento pendente, não reserva agenda). */

export type StatusCotacao = "pendente" | "convertida" | "arquivada";

export const STATUS_COTACAO_ROTULO: Record<StatusCotacao, string> = {
  pendente: "Pendente",
  convertida: "Convertida",
  arquivada: "Arquivada",
};

export interface CotacaoLista {
  id: string;
  numero: number;
  condicao: CondicaoLocatario;
  locatarioNome: string;
  salas: string[];
  data: string | null;
  periodo: PeriodoDia | null;
  qtdPessoas: number | null;
  valorTotalCentavos: number;
  status: StatusCotacao;
  convertidoLocacaoId: string | null;
  convertidoNumero: number | null;
  criadoEmUtc: string;
}

/** Rótulo humano da cotação (COT-000045). */
export function rotuloCotacao(numero: number): string {
  return `COT-${String(numero).padStart(6, "0")}`;
}
