import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { envCore } from "@/lib/env";

/**
 * Prova de verificação de e-mail (Spec 09 §4). Depois que o associado acerta o
 * código, marcamos o código como usado e devolvemos uma prova assinada (HMAC)
 * de curta duração. A etapa final (criar conta) exige esta prova — assim não é
 * possível pular a verificação chamando `criarConta` direto. Stateless: nada
 * no banco, a chave é o service role key (server-only, alta entropia).
 */

const TTL_MS = 15 * 60_000; // 15 min

function assinar(payload: string): string {
  return createHmac("sha256", envCore.SUPABASE_SERVICE_ROLE_KEY)
    .update(payload)
    .digest("base64url");
}

/** Gera a prova para um associado (expira em 15 min). */
export function assinarProva(associadoId: string): string {
  const payload = `${associadoId}.${Date.now() + TTL_MS}`;
  return `${Buffer.from(payload).toString("base64url")}.${assinar(payload)}`;
}

/** Valida a prova; retorna o associadoId se válida e não expirada, senão null. */
export function validarProva(token: string): string | null {
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

  const [associadoId, expStr] = payload.split(".");
  const exp = Number(expStr);
  if (!associadoId || !Number.isFinite(exp) || Date.now() > exp) return null;

  return associadoId;
}
