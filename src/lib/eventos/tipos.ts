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

/**
 * Data/hora do Sympla ("YYYY-MM-DD HH:mm:ss" no fuso local do evento, Brasil) →
 * `{ data, hora }` de parede para preencher o formulário. Puro/client-safe.
 */
export function partesDataHoraSympla(
  valor: string | null | undefined,
): { data: string; hora: string } | null {
  if (!valor) return null;
  const m = valor.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (!m) return null;
  return { data: m[1], hora: m[2] };
}
