import type { PrioridadeEvento } from "@/lib/calendario/tipos";

/** Tipos de domínio dos eventos internos (Spec 17), server + client. */

export type { PrioridadeEvento };

export const PRIORIDADES: { valor: PrioridadeEvento; rotulo: string; nota: string }[] = [
  { valor: "alta", rotulo: "Alta", nota: "Não remaneja" },
  { valor: "media", rotulo: "Média", nota: "Remanejável" },
  { valor: "baixa", rotulo: "Baixa", nota: "Remanejável" },
];

export interface EventoLista {
  id: string;
  titulo: string;
  salaId: string;
  salaNome: string;
  inicioUtc: string;
  fimUtc: string;
  prioridade: PrioridadeEvento;
  cancelado: boolean;
  symplaEventId: string | null;
  symplaUrl: string | null;
  qtdInscritos: number | null;
  capacidade: number;
}

export interface EventoDetalhe extends EventoLista {
  descricao: string | null;
  sincronizadoEmUtc: string | null;
  criadoEmUtc: string;
  atualizadoEmUtc: string;
}

/** Sala candidata a remanejamento (livre no horário, capacidade suficiente). */
export interface SalaRemanejo {
  id: string;
  nome: string;
  capacidade: number;
}
