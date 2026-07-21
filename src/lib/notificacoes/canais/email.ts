import "server-only";
import { enviarEmail, isResendConfigured } from "@/lib/integracoes/resend";
import type { ResultadoEnvio } from "./tipos";

/**
 * Canal e-mail (Resend). Canal sem env → falha transitória (backlog acumula e
 * é despachado quando a variável entrar). Falha de envio → transitória.
 */
export async function enviarEmailCanal(
  destino: string,
  assunto: string,
  html: string,
): Promise<ResultadoEnvio> {
  if (!destino.includes("@")) {
    return { ok: false, erro: "E-mail inválido.", retryable: false };
  }
  if (!isResendConfigured()) {
    return { ok: false, erro: "Canal e-mail não configurado.", retryable: true };
  }

  try {
    await enviarEmail({ para: destino, assunto, html });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      erro: e instanceof Error ? e.message : "Falha no envio do e-mail.",
      retryable: true,
    };
  }
}
