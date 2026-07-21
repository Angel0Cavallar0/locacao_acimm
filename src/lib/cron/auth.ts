import "server-only";
import { getEnvCron } from "@/lib/env";

/**
 * Autoriza uma rota de cron/webhook (Spec 16 §2). Exige o header
 * `Authorization: Bearer {CRON_SECRET}`. Sem secret configurado ou header
 * ausente/errado → não autoriza (a rota responde 401 sem corpo revelador).
 */
export function autorizarCron(req: Request): boolean {
  let secret: string;
  try {
    secret = getEnvCron().secret;
  } catch {
    return false;
  }
  const auth = req.headers.get("authorization") ?? "";
  return auth.length > 0 && auth === `Bearer ${secret}`;
}
