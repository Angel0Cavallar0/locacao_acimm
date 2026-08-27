/** Tipos de pendência de locação sem data (registro de intenção/prioridade). Puro — sem I/O. */

export type SituacaoPendencia = "aguardando" | "convertida" | "arquivada";

export const SITUACAO_PENDENCIA_ROTULO: Record<SituacaoPendencia, string> = {
  aguardando: "Aguardando",
  convertida: "Convertida",
  arquivada: "Arquivada",
};

export interface EntradaPendencia {
  id: string;
  associadoId: string | null;
  nome: string;
  contato: string;
  motivo: string | null;
  observacoes: string | null;
  criadoEmUtc: string;
  situacao: SituacaoPendencia;
  convertidoLocacaoId: string | null;
  convertidoNumero: number | null;
  arquivadoEmUtc: string | null;
  arquivadoMotivo: string | null;
  arquivadoPorNome: string | null;
}

export interface ContagensPendencia {
  aguardando: number;
  encerradas: number;
}
