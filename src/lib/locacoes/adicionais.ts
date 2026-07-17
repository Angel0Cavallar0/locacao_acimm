import "server-only";
import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { podeEditarAdicionais, type StatusLocacao } from "./maquina-estados-core";

export type ResultadoAdicional = { ok: true } | { erro: string };

type Admin = ReturnType<typeof createAdminClient>;

/** Recalcula valor_adicionais + valor_total no servidor e registra na auditoria. */
async function recomputarERegistrar(
  admin: Admin,
  locacaoId: string,
  autorUserId: string,
  observacao: string,
): Promise<void> {
  const { data: loc } = await admin
    .from("locacoes")
    .select(
      "status, valor_salas_centavos, valor_coffee_centavos, valor_descontos_centavos",
    )
    .eq("id", locacaoId)
    .maybeSingle();
  if (!loc) return;

  const { data: ads } = await admin
    .from("locacao_adicionais")
    .select("quantidade, valor_unitario_centavos")
    .eq("locacao_id", locacaoId);

  const valorAdicionais = (ads ?? []).reduce(
    (s, a) =>
      s + Math.round(Number(a.quantidade) * (a.valor_unitario_centavos ?? 0)),
    0,
  );
  const valorTotal =
    (loc.valor_salas_centavos as number) +
    (loc.valor_coffee_centavos as number) +
    valorAdicionais -
    (loc.valor_descontos_centavos as number);

  await admin
    .from("locacoes")
    .update({
      valor_adicionais_centavos: valorAdicionais,
      valor_total_centavos: valorTotal,
    })
    .eq("id", locacaoId);

  await admin.from("locacao_eventos").insert({
    locacao_id: locacaoId,
    de: loc.status as StatusLocacao,
    para: loc.status as StatusLocacao,
    autor_user_id: autorUserId,
    observacao,
  });
}

async function garantirEditavel(
  admin: Admin,
  locacaoId: string,
): Promise<string | null> {
  const { data: loc } = await admin
    .from("locacoes")
    .select("status")
    .eq("id", locacaoId)
    .maybeSingle();
  if (!loc) return "Locação não encontrada.";
  if (!podeEditarAdicionais(loc.status as StatusLocacao)) {
    return "Adicionais só podem ser editados até a aprovação.";
  }
  return null;
}

export async function adicionarAdicional(input: {
  locacaoId: string;
  descricao: string;
  quantidade: number;
  valorUnitarioCentavos: number;
}): Promise<ResultadoAdicional> {
  const { user } = await requireColaborador();
  const admin = createAdminClient();

  const erro = await garantirEditavel(admin, input.locacaoId);
  if (erro) return { erro };

  const { error } = await admin.from("locacao_adicionais").insert({
    locacao_id: input.locacaoId,
    descricao: input.descricao,
    quantidade: input.quantidade,
    valor_unitario_centavos: input.valorUnitarioCentavos,
  });
  if (error) return { erro: "Não foi possível incluir o adicional." };

  await recomputarERegistrar(
    admin,
    input.locacaoId,
    user.id,
    `Adicional incluído: ${input.descricao}`,
  );
  revalidatePath(`/admin/locacoes/${input.locacaoId}`);
  return { ok: true };
}

export async function editarAdicional(input: {
  adicionalId: string;
  descricao: string;
  quantidade: number;
  valorUnitarioCentavos: number;
}): Promise<ResultadoAdicional> {
  const { user } = await requireColaborador();
  const admin = createAdminClient();

  const { data: ad } = await admin
    .from("locacao_adicionais")
    .select("locacao_id")
    .eq("id", input.adicionalId)
    .maybeSingle();
  if (!ad) return { erro: "Adicional não encontrado." };
  const locacaoId = ad.locacao_id as string;

  const erro = await garantirEditavel(admin, locacaoId);
  if (erro) return { erro };

  const { error } = await admin
    .from("locacao_adicionais")
    .update({
      descricao: input.descricao,
      quantidade: input.quantidade,
      valor_unitario_centavos: input.valorUnitarioCentavos,
    })
    .eq("id", input.adicionalId);
  if (error) return { erro: "Não foi possível salvar o adicional." };

  await recomputarERegistrar(
    admin,
    locacaoId,
    user.id,
    `Adicional alterado: ${input.descricao}`,
  );
  revalidatePath(`/admin/locacoes/${locacaoId}`);
  return { ok: true };
}

export async function removerAdicional(
  adicionalId: string,
): Promise<ResultadoAdicional> {
  const { user } = await requireColaborador();
  const admin = createAdminClient();

  const { data: ad } = await admin
    .from("locacao_adicionais")
    .select("locacao_id, descricao")
    .eq("id", adicionalId)
    .maybeSingle();
  if (!ad) return { erro: "Adicional não encontrado." };
  const locacaoId = ad.locacao_id as string;

  const erro = await garantirEditavel(admin, locacaoId);
  if (erro) return { erro };

  const { error } = await admin
    .from("locacao_adicionais")
    .delete()
    .eq("id", adicionalId);
  if (error) return { erro: "Não foi possível remover o adicional." };

  await recomputarERegistrar(
    admin,
    locacaoId,
    user.id,
    `Adicional removido: ${ad.descricao}`,
  );
  revalidatePath(`/admin/locacoes/${locacaoId}`);
  return { ok: true };
}
