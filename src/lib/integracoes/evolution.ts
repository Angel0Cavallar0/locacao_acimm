import "server-only";
import { getEnvEvolution } from "@/lib/env";

/**
 * Integração Evolution API v2 (CLAUDE.md §6.5) — WhatsApp transacional.
 * Chamada direta à API REST. Nenhum conteúdo menciona ferramentas/stack.
 */

export function isEvolutionConfigured(): boolean {
  return Boolean(
    process.env.EVOLUTION_API_URL &&
      process.env.EVOLUTION_API_KEY &&
      process.env.EVOLUTION_INSTANCE,
  );
}

/**
 * Envia texto simples ao número já normalizado (55 + DDD + 9 + 8 dígitos).
 * Lança em falha de rede/HTTP — quem chama decide sobre retry.
 */
export async function enviarWhatsappTexto(
  numero: string,
  texto: string,
): Promise<void> {
  const { apiUrl, apiKey, instance } = getEnvEvolution();

  const resp = await fetch(
    `${apiUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instance)}`,
    {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number: numero, text: texto }),
    },
  );

  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => "");
    throw new Error(
      `Evolution falhou (${resp.status}): ${detalhe.slice(0, 300)}`,
    );
  }
}
