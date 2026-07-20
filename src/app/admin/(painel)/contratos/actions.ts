"use server";

import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { enviarContrato } from "@/lib/contratos/enviar";
import { gerarContrato } from "@/lib/contratos/gerar";
import { createAdminClient } from "@/lib/supabase/admin";

function revalidar(locacaoId: string) {
  revalidatePath("/admin/contratos");
  revalidatePath(`/admin/locacoes/${locacaoId}`);
  revalidatePath(`/locacoes/${locacaoId}`);
}

/** (Re)gera o PDF do contrato (Spec 13 §3). */
export async function regenerarContratoAction(
  locacaoId: string,
): Promise<{ ok?: true; aviso?: string; error?: string }> {
  const { user } = await requireColaborador();
  const g = await gerarContrato(locacaoId, user.id);
  if (g.error) return { error: g.error };
  revalidar(locacaoId);
  return {
    ok: true,
    aviso: g.responsavelFallback
      ? "Locação sem responsável — usei o nome do locatário no contrato."
      : undefined,
  };
}

/** Reenvia o contrato ao locatário conforme o modo (Spec 13 §6). */
export async function reenviarContratoAction(
  locacaoId: string,
): Promise<{ ok?: true; aviso?: string; error?: string }> {
  const { user } = await requireColaborador();
  const r = await enviarContrato(locacaoId, user.id);
  if (r.error) return { error: r.error };
  revalidar(locacaoId);
  return { ok: true, aviso: r.aviso };
}

/** URL assinada de curta duração para baixar o PDF (admin). */
export async function urlContratoAdminAction(
  locacaoId: string,
): Promise<{ url?: string; error?: string }> {
  await requireColaborador();
  const admin = createAdminClient();
  const { data: c } = await admin
    .from("contratos")
    .select("pdf_url")
    .eq("locacao_id", locacaoId)
    .maybeSingle();
  const path = c?.pdf_url as string | null;
  if (!path) return { error: "Contrato não disponível." };
  const { data, error } = await admin.storage
    .from("contratos")
    .createSignedUrl(path, 300);
  if (error || !data) return { error: "Não foi possível abrir o contrato." };
  return { url: data.signedUrl };
}
