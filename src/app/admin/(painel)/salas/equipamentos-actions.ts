"use server";

import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

export interface Equipamento {
  id: string;
  nome: string;
}

export async function listarEquipamentos(): Promise<Equipamento[]> {
  await requireColaborador();
  const admin = createAdminClient();
  const { data } = await admin
    .from("equipamentos")
    .select("id, nome")
    .order("nome", { ascending: true });
  return (data ?? []) as Equipamento[];
}

export async function criarEquipamento(
  nomeRaw: string,
): Promise<Equipamento | { error: string }> {
  await requireColaborador();
  const nome = nomeRaw.trim();
  if (!nome) return { error: "Informe o nome do equipamento." };
  if (nome.length > 60) return { error: "Nome muito longo." };

  const admin = createAdminClient();

  // Reaproveita se já existe (case-insensitive).
  const { data: existente } = await admin
    .from("equipamentos")
    .select("id, nome")
    .ilike("nome", nome)
    .maybeSingle();
  if (existente) return existente as Equipamento;

  const { data, error } = await admin
    .from("equipamentos")
    .insert({ nome })
    .select("id, nome")
    .single();
  if (error || !data) return { error: "Não foi possível criar a tag." };

  revalidatePath("/admin/salas");
  return data as Equipamento;
}

/** Remove a tag do catálogo E de todas as salas que a usam. */
export async function removerEquipamento(
  id: string,
): Promise<{ error?: string }> {
  await requireColaborador();
  const admin = createAdminClient();

  const { data: eq } = await admin
    .from("equipamentos")
    .select("nome")
    .eq("id", id)
    .maybeSingle();
  if (!eq) return {};

  const { error } = await admin.from("equipamentos").delete().eq("id", id);
  if (error) return { error: "Não foi possível remover a tag." };

  const { data: salas } = await admin
    .from("salas")
    .select("id, equipamentos")
    .contains("equipamentos", [eq.nome]);

  await Promise.all(
    (salas ?? []).map((s) =>
      admin
        .from("salas")
        .update({
          equipamentos: ((s.equipamentos as string[]) ?? []).filter(
            (x) => x !== eq.nome,
          ),
        })
        .eq("id", s.id),
    ),
  );

  revalidatePath("/admin/salas");
  return {};
}
