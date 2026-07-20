"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import type { ModoEnvioContrato } from "@/lib/contratos/tipos";
import { isAutentiqueConfigured } from "@/lib/integracoes/autentique";
import { createAdminClient } from "@/lib/supabase/admin";

/** Salva o modo de envio do contrato (Spec 13 §5). Admin only. */
export async function salvarModoContrato(
  modo: ModoEnvioContrato,
): Promise<{ ok?: true; error?: string }> {
  const { user } = await requireAdmin();
  if (modo !== "email" && modo !== "autentique") {
    return { error: "Modo inválido." };
  }
  if (modo === "autentique" && !isAutentiqueConfigured()) {
    return { error: "Assinatura digital indisponível — token não configurado." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("configuracoes").upsert(
    {
      chave: "modo_envio_contrato",
      valor: modo,
      atualizado_por: user.id,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "chave" },
  );
  if (error) return { error: "Não foi possível salvar a configuração." };

  revalidatePath("/admin/configuracoes");
  return { ok: true };
}
