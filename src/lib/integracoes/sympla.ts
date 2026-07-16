import "server-only";

/**
 * Integração Sympla (CLAUDE.md §6.2) — SOMENTE LEITURA.
 * Base: https://api.sympla.com.br/public/v1.5.1 (header `s_token`).
 * Stub tipado — implementação real no módulo de integrações (Fase 5).
 */

export interface SymplaEvent {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
}

export interface SymplaParticipant {
  id: number;
  event_id: number;
  ticket_name: string;
}

export function isSymplaConfigured(): boolean {
  return Boolean(process.env.SYMPLA_API_TOKEN);
}

export async function listarEventos(): Promise<SymplaEvent[]> {
  throw new Error("Sympla: não implementado (stub Fase 0).");
}

export async function listarInscritos(_eventId: number): Promise<SymplaParticipant[]> {
  throw new Error("Sympla: não implementado (stub Fase 0).");
}
