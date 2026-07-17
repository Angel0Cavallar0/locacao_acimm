"use server";

import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { type ComboInput, comboSchema } from "@/lib/validacoes/salas";

export interface EstadoCombo {
  error?: string;
  id?: string;
}

export interface ResultadoCombo {
  error?: string;
}

function linhasCombo(id: string, input: ComboInput) {
  return {
    combo: {
      nome: input.nome,
      descricao: input.descricao || null,
      tipo: input.tipo,
      tipo_desconto:
        input.tipo === "desconto_multi_sala" ? input.tipoDesconto : null,
      desconto_valor:
        input.tipo === "desconto_multi_sala" ? input.descontoValor : null,
      valor_centavos:
        input.tipo === "assinatura_mensal" || input.tipo === "evento_privativo"
          ? input.valorCentavos
          : null,
      dias_no_mes:
        input.tipo === "assinatura_mensal" ? input.diasNoMes : null,
    },
    salas:
      input.tipo === "evento_privativo"
        ? []
        : input.salas.map((s) => ({
            combo_id: id,
            sala_id: s.salaId,
            aplica_desconto:
              input.tipo === "desconto_multi_sala" ? s.aplicaDesconto : false,
          })),
  };
}

export async function criarCombo(input: ComboInput): Promise<EstadoCombo> {
  await requireColaborador();
  const parsed = comboSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const admin = createAdminClient();
  const { combo, salas } = linhasCombo("", parsed.data);

  const { data, error } = await admin
    .from("combos")
    .insert(combo)
    .select("id")
    .single();
  if (error || !data) return { error: "Não foi possível criar o combo." };

  if (salas.length > 0) {
    const rows = salas.map((s) => ({ ...s, combo_id: data.id }));
    const { error: e2 } = await admin.from("combo_salas").insert(rows);
    if (e2) {
      await admin.from("combos").delete().eq("id", data.id);
      return { error: "Não foi possível salvar as salas do combo." };
    }
  }

  revalidatePath("/admin/salas");
  return { id: data.id as string };
}

export async function atualizarCombo(
  id: string,
  input: ComboInput,
): Promise<ResultadoCombo> {
  await requireColaborador();
  const parsed = comboSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const admin = createAdminClient();
  const { combo, salas } = linhasCombo(id, parsed.data);

  const { error } = await admin.from("combos").update(combo).eq("id", id);
  if (error) return { error: "Não foi possível salvar o combo." };

  // Substitui as salas do combo.
  await admin.from("combo_salas").delete().eq("combo_id", id);
  if (salas.length > 0) {
    const { error: e2 } = await admin.from("combo_salas").insert(salas);
    if (e2) return { error: "Não foi possível salvar as salas do combo." };
  }

  revalidatePath("/admin/salas");
  revalidatePath(`/admin/salas/combos/${id}`);
  return {};
}

export async function alternarAtivoCombo(
  id: string,
  ativo: boolean,
): Promise<ResultadoCombo> {
  await requireColaborador();
  const admin = createAdminClient();
  const { error } = await admin.from("combos").update({ ativo }).eq("id", id);
  if (error) return { error: "Não foi possível atualizar o combo." };
  revalidatePath("/admin/salas");
  return {};
}
