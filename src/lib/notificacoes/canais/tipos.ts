/**
 * Resultado de um envio por canal (Spec 15 §3). `retryable` distingue falha
 * transitória (rede, canal sem env → tenta de novo no backoff) de falha
 * definitiva (telefone inválido, template inexistente → status `falha` já).
 */
export type ResultadoEnvio =
  | { ok: true }
  | { ok: false; erro: string; retryable: boolean };
