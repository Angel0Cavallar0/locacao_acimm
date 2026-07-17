"use server";

import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { precoSchema } from "@/lib/validacoes/salas";

export interface ResultadoPrecoAcao {
  error?: string;
}

export async function reajustarPreco(input: {
  salaId: string;
  condicao: string;
  periodo: string;
  diasSemana: number[];
  valorCentavos: number;
}): Promise<ResultadoPrecoAcao> {
  await requireColaborador();

  const parsed = precoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const admin = createAdminClient();
  const { error } = await admin.rpc("reajustar_preco_sala", {
    p_sala_id: parsed.data.salaId,
    p_condicao: parsed.data.condicao,
    p_periodo: parsed.data.periodo,
    p_dias_semana: parsed.data.diasSemana,
    p_valor_centavos: parsed.data.valorCentavos,
  });

  if (error) {
    // As funções levantam mensagens amigáveis em pt-BR (ex.: conflito de dias).
    return { error: error.message || "Não foi possível salvar o preço." };
  }

  revalidatePath(`/admin/salas/${parsed.data.salaId}`);
  return {};
}

export async function encerrarPreco(
  precoId: string,
  salaId: string,
): Promise<ResultadoPrecoAcao> {
  await requireColaborador();

  const admin = createAdminClient();
  const { error } = await admin.rpc("encerrar_preco_sala", { p_id: precoId });
  if (error) return { error: "Não foi possível encerrar o preço." };

  revalidatePath(`/admin/salas/${salaId}`);
  return {};
}
