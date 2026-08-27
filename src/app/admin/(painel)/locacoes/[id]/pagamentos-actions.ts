"use server";

import { requireColaborador } from "@/lib/auth/guards";
import {
  confirmarComPagamentoPendente,
  darBaixaPagamento,
  estornarPagamento,
  recomporPagamentos,
} from "@/lib/pagamentos/gestao";
import type { FormaPagamento } from "@/lib/pagamentos/pagamentos-core";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  darBaixaSchema,
  estornarSchema,
  recomporSchema,
} from "@/lib/validacoes/pagamentos";

export interface ResultadoAcao {
  error?: string;
}

/** Dá baixa em um pagamento pendente (Spec 14 §4). */
export async function darBaixaAction(input: {
  pagamentoId: string;
  dataEfetiva?: string;
  observacao?: string;
}): Promise<ResultadoAcao> {
  const parsed = darBaixaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const r = await darBaixaPagamento(parsed.data);
  return "ok" in r ? {} : { error: r.erro };
}

/** Estorna um pagamento pago, recriando um pendente equivalente (§4). */
export async function estornarAction(input: {
  pagamentoId: string;
  motivo: string;
}): Promise<ResultadoAcao> {
  const parsed = estornarSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const r = await estornarPagamento(parsed.data);
  return "ok" in r ? {} : { error: r.erro };
}

/** Confirma a locação mesmo com pagamento pendente — ação explícita e auditada. */
export async function confirmarComPendenciaAction(
  locacaoId: string,
): Promise<ResultadoAcao> {
  const r = await confirmarComPagamentoPendente(locacaoId);
  return "ok" in r ? {} : { error: r.erro };
}

/** Recompõe os pagamentos (divisão híbrida) — enquanto todos pendentes (§4). */
export async function recomporAction(input: {
  locacaoId: string;
  itens: {
    descricao: string;
    forma: FormaPagamento;
    valorCentavos: number;
    observacao?: string;
  }[];
}): Promise<ResultadoAcao> {
  const parsed = recomporSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const r = await recomporPagamentos(parsed.data);
  return "ok" in r ? {} : { error: r.erro };
}

/** URL assinada de curta duração para o colaborador ver o comprovante. */
export async function urlComprovanteAdminAction(
  pagamentoId: string,
): Promise<{ url?: string; error?: string }> {
  await requireColaborador();
  const admin = createAdminClient();
  const { data } = await admin
    .from("pagamentos")
    .select("comprovante_url")
    .eq("id", pagamentoId)
    .maybeSingle();
  const path = data?.comprovante_url as string | null;
  if (!path) return { error: "Comprovante não disponível." };
  const { data: signed, error } = await admin.storage
    .from("comprovantes")
    .createSignedUrl(path, 300);
  if (error || !signed) return { error: "Não foi possível abrir o comprovante." };
  return { url: signed.signedUrl };
}
