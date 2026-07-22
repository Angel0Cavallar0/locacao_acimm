"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

/** URL vazia = webhook desativado; senão precisa ser http(s) válida. */
function urlValida(url: string): boolean {
  if (url === "") return true;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/** Salva a URL do webhook de sincronização de associados (Spec 27). Admin only. */
export async function salvarWebhookAssociadosAction(
  url: string,
): Promise<{ ok?: true; error?: string }> {
  const { user } = await requireAdmin();
  const limpa = (url ?? "").trim();
  if (!urlValida(limpa)) {
    return { error: "Informe uma URL válida (http/https) ou deixe em branco." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("configuracoes").upsert(
    {
      chave: "webhook_associados",
      valor: { url: limpa },
      atualizado_por: user.id,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "chave" },
  );
  if (error) return { error: "Não foi possível salvar a configuração." };

  revalidatePath("/admin/configuracoes/webhooks");
  return { ok: true };
}
