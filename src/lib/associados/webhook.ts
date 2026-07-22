import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Webhook de sincronização de associados (Spec 27). Único ponto de saída
 * app → n8n: dispara o workflow que atualiza `associados` a partir do Sophus.
 * A URL é parametrizável na UI (Configurações › Webhooks) e vive em
 * `configuracoes.webhook_associados` (não é env — o padrão da casa p/ valores
 * configuráveis). A app nunca fala com o Sophus direto — só aciona o n8n.
 */

const webhookSchema = z.object({ url: z.string() });

export interface WebhookAssociados {
  url: string;
}

/** Lê `configuracoes.webhook_associados`; fallback para URL vazia. */
export async function obterWebhookAssociados(): Promise<WebhookAssociados> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("configuracoes")
    .select("valor")
    .eq("chave", "webhook_associados")
    .maybeSingle();

  const parsed = webhookSchema.safeParse(data?.valor);
  return parsed.success ? { url: parsed.data.url.trim() } : { url: "" };
}

export type ResultadoWebhook = { ok: true } | { erro: string };

/**
 * Dispara o webhook do n8n (fire-and-forget: o n8n responde rápido ao gatilho e
 * roda o sync em background). Timeout de 15s só p/ não pendurar a action.
 */
export async function dispararWebhookAssociados(): Promise<ResultadoWebhook> {
  const { url } = await obterWebhookAssociados();
  if (!url) {
    return { erro: "Configure o webhook em Configurações › Webhooks." };
  }

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origem: "admin",
        solicitadoEm: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return {
      erro: "Não foi possível contatar o serviço de sincronização. Tente novamente.",
    };
  }

  if (!resp.ok) {
    const detalhe = (await resp.text().catch(() => "")).slice(0, 200);
    return {
      erro: `O serviço de sincronização respondeu com erro (${resp.status}).${detalhe ? ` ${detalhe}` : ""}`,
    };
  }

  return { ok: true };
}
