"use server";

import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { horaAdicionalSchema, precoSchema } from "@/lib/validacoes/salas";

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

export async function salvarHoraAdicional(input: {
  salaId: string;
  minutos: number | null;
  valores: { condicao: string; categoria: string; valorCentavos: number }[];
}): Promise<ResultadoPrecoAcao> {
  await requireColaborador();

  const parsed = horaAdicionalSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const admin = createAdminClient();

  const { error: eMin } = await admin
    .from("salas")
    .update({ hora_adicional_minutos: parsed.data.minutos })
    .eq("id", parsed.data.salaId);
  if (eMin) return { error: "Não foi possível salvar a configuração." };

  if (parsed.data.valores.length > 0) {
    const rows = parsed.data.valores.map((v) => ({
      sala_id: parsed.data.salaId,
      condicao: v.condicao,
      categoria: v.categoria,
      valor_centavos: v.valorCentavos,
    }));
    const { error } = await admin
      .from("precos_hora_adicional")
      .upsert(rows, { onConflict: "sala_id,condicao,categoria" });
    if (error) return { error: "Não foi possível salvar os valores." };
  }

  revalidatePath(`/admin/salas/${parsed.data.salaId}`);
  return {};
}
