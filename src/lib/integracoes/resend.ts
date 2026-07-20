import "server-only";
import { getEnvResend } from "@/lib/env";

/**
 * Integração Resend (CLAUDE.md §6.5) — e-mail transacional.
 * Canal paralelo/fallback do WhatsApp. Chamada direta à API REST (sem SDK).
 */

export interface AnexoEmail {
  /** Nome do arquivo exibido no e-mail (ex.: "contrato.pdf"). */
  filename: string;
  /** Conteúdo em base64. */
  content: string;
}

export interface Email {
  para: string | string[];
  assunto: string;
  html: string;
  anexos?: AnexoEmail[];
}

/**
 * Remetente. Precisa de domínio verificado no Resend em produção — configure
 * `EMAIL_FROM` (ex.: "ACIMM <nao-responder@seu-dominio.com.br>"). O default
 * `onboarding@resend.dev` só entrega para o dono da conta (uso de teste).
 */
const REMETENTE = process.env.EMAIL_FROM ?? "ACIMM <onboarding@resend.dev>";

export function isResendConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function enviarEmail(email: Email): Promise<void> {
  const { apiKey } = getEnvResend();

  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: REMETENTE,
      to: Array.isArray(email.para) ? email.para : [email.para],
      subject: email.assunto,
      html: email.html,
      ...(email.anexos && email.anexos.length > 0
        ? { attachments: email.anexos }
        : {}),
    }),
  });

  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => "");
    throw new Error(`Resend falhou (${resp.status}): ${detalhe.slice(0, 300)}`);
  }
}
