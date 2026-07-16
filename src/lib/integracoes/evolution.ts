import "server-only";

/**
 * Integração Evolution API (CLAUDE.md §6.5) — WhatsApp transacional.
 * Notificações sempre em par com e-mail (Resend); falha em um canal não
 * bloqueia o outro. Stub tipado — implementação real na Fase 4.
 */

export interface MensagemWhatsapp {
  telefone: string;
  texto: string;
}

export function isEvolutionConfigured(): boolean {
  return Boolean(
    process.env.EVOLUTION_API_URL &&
      process.env.EVOLUTION_API_KEY &&
      process.env.EVOLUTION_INSTANCE,
  );
}

export async function enviarWhatsapp(_msg: MensagemWhatsapp): Promise<void> {
  throw new Error("Evolution API: não implementado (stub Fase 0).");
}
