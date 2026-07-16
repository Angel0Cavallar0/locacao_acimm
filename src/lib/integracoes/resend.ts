import "server-only";

/**
 * Integração Resend (CLAUDE.md §6.5) — e-mail transacional.
 * Canal paralelo/fallback do WhatsApp. Stub tipado — implementação Fase 4.
 */

export interface Email {
  para: string;
  assunto: string;
  html: string;
}

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function enviarEmail(_email: Email): Promise<void> {
  throw new Error("Resend: não implementado (stub Fase 0).");
}
