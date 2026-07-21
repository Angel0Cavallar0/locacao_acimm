/** Tipos da lista de espera (Spec 19). Puro — sem I/O. */

export type VisaoFila = "aguardando" | "vencidas" | "encerradas";

export type SituacaoFila =
  | "aguardando"
  | "vencida"
  | "convertida"
  | "arquivada";

export const SITUACAO_ROTULO: Record<SituacaoFila, string> = {
  aguardando: "Aguardando",
  vencida: "Vencida",
  convertida: "Convertida",
  arquivada: "Arquivada",
};

export interface EntradaFila {
  id: string;
  salaId: string | null;
  salaNome: string | null; // null = "Qualquer sala"
  data: string; // 'YYYY-MM-DD'
  associadoId: string | null;
  nome: string;
  contato: string;
  observacoes: string | null;
  criadoEmUtc: string;
  /** Posição na fila (1-based) dentro do grupo data×sala; 0 se encerrada. */
  posicao: number;
  situacao: SituacaoFila;
  convertidoLocacaoId: string | null;
  convertidoNumero: number | null;
  arquivadoEmUtc: string | null;
  arquivadoMotivo: string | null;
  arquivadoPorNome: string | null;
}

export interface ContagensFila {
  aguardando: number;
  vencidas: number;
  encerradas: number;
}

/** Rótulo do grupo de sala (null = "Qualquer sala"). */
export function rotuloSala(nome: string | null): string {
  return nome ?? "Qualquer sala";
}
