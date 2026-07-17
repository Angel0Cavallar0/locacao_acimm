import "server-only";

/**
 * Rate limiting simples em memória (janela deslizante) para o login do
 * colaborador — anti-enumeração (CLAUDE.md §4.7, Spec 03 §3.1).
 *
 * ATENÇÃO: é best-effort e por instância. Em produção serverless (Vercel),
 * várias instâncias não compartilham este estado — trocar por Upstash/Redis
 * ou uma tabela quando o volume justificar. Suficiente como primeira barreira.
 */

const JANELA_MS = 60_000; // 1 minuto
const MAX_TENTATIVAS = 5;

const tentativas = new Map<string, number[]>();

export interface ResultadoRateLimit {
  permitido: boolean;
  restantes: number;
  resetEmMs: number;
}

export function checarRateLimit(chave: string): ResultadoRateLimit {
  const agora = Date.now();
  const recentes = (tentativas.get(chave) ?? []).filter(
    (t) => agora - t < JANELA_MS,
  );

  if (recentes.length >= MAX_TENTATIVAS) {
    const maisAntiga = recentes[0];
    return {
      permitido: false,
      restantes: 0,
      resetEmMs: JANELA_MS - (agora - maisAntiga),
    };
  }

  recentes.push(agora);
  tentativas.set(chave, recentes);

  // Limpeza oportunista para não crescer indefinidamente.
  if (tentativas.size > 5_000) {
    for (const [k, ts] of tentativas) {
      if (ts.every((t) => agora - t >= JANELA_MS)) tentativas.delete(k);
    }
  }

  return {
    permitido: true,
    restantes: MAX_TENTATIVAS - recentes.length,
    resetEmMs: JANELA_MS,
  };
}
