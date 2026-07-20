import "server-only";
import type { ContextoEfeito } from "@/lib/locacoes/efeitos";
import { criarPagamentosIniciais } from "./gestao";

/**
 * Efeito de `aguardando_pagamento` (Spec 14 §3): cria os registros de pagamento.
 * Vive em módulo próprio para ser importado DINAMICAMENTE por `efeitos.ts`,
 * quebrando o ciclo efeitos → pagamentos/gestao → maquina-estados → efeitos.
 */
export async function processarAguardandoPagamento(
  ctx: ContextoEfeito,
): Promise<void> {
  await criarPagamentosIniciais(ctx.locacaoId);
}
