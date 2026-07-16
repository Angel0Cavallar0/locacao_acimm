import "server-only";

/**
 * Integração Google Calendar (CLAUDE.md §6.4) — espelho unidirecional.
 * Conexão única da conta ACIMM (OAuth), tokens criptografados no banco.
 * Callback fixo: /api/google/callback. Stub tipado — implementação Fase 5.
 */

export interface EventoCalendario {
  googleEventId: string;
  titulo: string;
  inicio: string;
  fim: string;
  convidados: string[];
}

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI,
  );
}

export async function criarEvento(_evento: Omit<EventoCalendario, "googleEventId">) {
  throw new Error("Google Calendar: não implementado (stub Fase 0).");
}
