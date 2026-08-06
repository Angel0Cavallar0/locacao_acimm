"use server";

import { requireColaborador } from "@/lib/auth/guards";
import { carregarRelatorioMes } from "@/lib/relatorios/dados";
import { gerarPdfMes } from "@/lib/relatorios/pdf-mes";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Gera o relatório mensal de locações em PDF (Spec 32 §1.4) e devolve base64
 * para download no client (padrão de `coffee/actions.ts`). Só colaborador.
 */
export async function exportarMesPdfAction(input: {
  deISO: string;
  ateISO: string;
}): Promise<{ base64: string; nome: string } | { error: string }> {
  await requireColaborador();
  if (
    !DATA_RE.test(input.deISO) ||
    !DATA_RE.test(input.ateISO) ||
    input.ateISO < input.deISO
  ) {
    return { error: "Período inválido." };
  }
  const rel = await carregarRelatorioMes(input.deISO, input.ateISO);
  const buffer = await gerarPdfMes(rel);
  return {
    base64: buffer.toString("base64"),
    nome: `locacoes_${input.deISO}_a_${input.ateISO}.pdf`,
  };
}
