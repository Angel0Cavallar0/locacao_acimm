import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { envCore } from "@/lib/env";

/**
 * `state` do OAuth do Google (Spec 18 §3) — proteção CSRF. Assina
 * `${userId}.${expiry}` com HMAC (chave = service role key, alta entropia,
 * server-only). Stateless: nada no banco. No callback, um `state` ausente ou
 * adulterado é rejeitado; um válido devolve o id do admin que iniciou o fluxo
 * (vira `conectado_por`). Mesmo formato da prova de verificação (Spec 09).
 */

const TTL_MS = 10 * 60_000; // 10 min para concluir o consentimento

function assinar(payload: string): string {
  return createHmac("sha256", envCore.SUPABASE_SERVICE_ROLE_KEY)
    .update(payload)
    .digest("base64url");
}

export function assinarState(userId: string): string {
  const payload = `${userId}.${Date.now() + TTL_MS}`;
  return `${Buffer.from(payload).toString("base64url")}.${assinar(payload)}`;
}

/** Retorna o userId se válido e não expirado; senão null. */
export function validarState(token: string): string | null {
  const partes = token.split(".");
  if (partes.length !== 2) return null;
  const [corpoB64, assinatura] = partes;

  let payload: string;
  try {
    payload = Buffer.from(corpoB64, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const esperada = assinar(payload);
  const a = Buffer.from(assinatura);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const [userId, expStr] = payload.split(".");
  const exp = Number(expStr);
  if (!userId || !Number.isFinite(exp) || Date.now() > exp) return null;

  return userId;
}
