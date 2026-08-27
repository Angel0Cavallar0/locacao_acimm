import "server-only";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Exclusão DEFINITIVA de uma locação (pedido da ACIMM para limpar lançamentos
 * incorretos/duplicados) — diferente de cancelar (soft, via máquina de
 * estados). Apaga de verdade a locação e tudo que depende dela (coffee,
 * adicionais, contrato, pagamentos, comissões, linha do tempo — cascade no
 * banco), mas grava antes um log separado e imutável
 * (`locacoes_excluidas_log`, sem FK viva) para não perder rastreabilidade
 * total. Só admin (ação irreversível e destrutiva) — ver RPC
 * `excluir_locacao_definitivamente` (migration 0067).
 */

export type ResultadoExclusao = { ok: true } | { erro: string };

export async function excluirLocacaoDefinitivamente(input: {
  locacaoId: string;
  motivo: string;
}): Promise<ResultadoExclusao> {
  const { user } = await requireAdmin();
  const motivo = input.motivo.trim();
  if (motivo.length === 0) return { erro: "Informe o motivo da exclusão." };

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("excluir_locacao_definitivamente", {
    p_locacao_id: input.locacaoId,
    p_autor: user.id,
    p_motivo: motivo,
  });
  if (error) return { erro: "Não foi possível excluir a locação." };
  if (data === "nao_encontrada") return { erro: "Locação não encontrada." };
  if (data === "competencia_fechada") {
    return {
      erro:
        "Há comissão desta locação numa competência já fechada. Reabra o fechamento antes de excluir.",
    };
  }

  revalidatePath("/admin/locacoes");
  revalidatePath("/admin/calendario");
  revalidatePath("/admin");
  revalidatePath("/admin/comissoes");
  return { ok: true };
}
