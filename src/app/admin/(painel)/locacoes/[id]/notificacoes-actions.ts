"use server";

import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { agendarProcessamento } from "@/lib/notificacoes/processar";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Reenvio manual de uma notificação (Spec 15 §6): zera tentativas e reagenda o
 * envio. Mantém a MESMA linha (histórico de tentativas fica no contador).
 */
export async function reenviarNotificacaoAction(
  notificacaoId: string,
): Promise<{ error?: string }> {
  await requireColaborador();
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("notificacoes")
    .update({
      status: "pendente",
      tentativas: 0,
      ultima_tentativa_em: null,
      ultimo_erro: null,
    })
    .eq("id", notificacaoId)
    .select("locacao_id")
    .maybeSingle();
  if (error || !data) return { error: "Não foi possível reenviar." };

  agendarProcessamento();

  if (data.locacao_id) {
    revalidatePath(`/admin/locacoes/${data.locacao_id as string}`);
  }
  return {};
}
