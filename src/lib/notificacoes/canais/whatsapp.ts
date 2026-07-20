import "server-only";
import {
  enviarWhatsappTexto,
  isEvolutionConfigured,
} from "@/lib/integracoes/evolution";
import { normalizarTelefoneBR } from "@/lib/utils/telefone";
import type { ResultadoEnvio } from "./tipos";

/**
 * Canal WhatsApp (Evolution). Normaliza o destino BR; número inválido é falha
 * DEFINITIVA (sem retry inútil). Canal sem env → falha transitória (o backlog
 * despacha quando a variável entrar).
 */
export async function enviarWhatsapp(
  destino: string,
  texto: string,
): Promise<ResultadoEnvio> {
  const norm = normalizarTelefoneBR(destino);
  if ("erro" in norm) {
    return { ok: false, erro: norm.erro, retryable: false };
  }

  if (!isEvolutionConfigured()) {
    return {
      ok: false,
      erro: "Canal WhatsApp não configurado.",
      retryable: true,
    };
  }

  try {
    await enviarWhatsappTexto(norm.numero, texto);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      erro: e instanceof Error ? e.message : "Falha no envio do WhatsApp.",
      retryable: true,
    };
  }
}
