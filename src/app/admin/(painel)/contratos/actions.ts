"use server";

import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { enviarContrato } from "@/lib/contratos/enviar";
import { gerarContrato } from "@/lib/contratos/gerar";
import { aplicarTransicao } from "@/lib/locacoes/maquina-estados";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET_CONTRATOS = "contratos";
const MAX_BYTES = 8 * 1024 * 1024;

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

/** URL assinada do contrato assinado enviado pelo associado (conferência). */
export async function urlContratoAssinadoAdminAction(
  locacaoId: string,
): Promise<{ url?: string; error?: string }> {
  await requireColaborador();
  const admin = createAdminClient();
  const { data: c } = await admin
    .from("contratos")
    .select("pdf_assinado_url")
    .eq("locacao_id", locacaoId)
    .maybeSingle();
  const path = c?.pdf_assinado_url as string | null;
  if (!path) return { error: "Contrato assinado não disponível." };
  const { data, error } = await admin.storage
    .from("contratos")
    .createSignedUrl(path, 300);
  if (error || !data) {
    return { error: "Não foi possível abrir o contrato assinado." };
  }
  return { url: data.signedUrl };
}

// ---------------------------------------------------------------------------
// Upload do contrato assinado PELA ACIMM — caso de assinatura presencial na
// sede (o associado nunca passa pelo Portal). Só PDF; anexar já marca a
// locação como "contrato_assinado" (quem anexa presenciou a assinatura).
// ---------------------------------------------------------------------------

interface ContratoAdmin {
  id: string;
  status: string;
  pdfAssinadoUrl: string | null;
}

async function buscarContratoAdmin(
  admin: ReturnType<typeof createAdminClient>,
  locacaoId: string,
): Promise<ContratoAdmin | null> {
  const { data } = await admin
    .from("contratos")
    .select("id, status, pdf_assinado_url")
    .eq("locacao_id", locacaoId)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id as string,
    status: data.status as string,
    pdfAssinadoUrl: (data.pdf_assinado_url as string | null) ?? null,
  };
}

export interface PreparoContratoAssinadoAdmin {
  path: string;
  token: string;
}

/** URL assinada para upload direto do PDF assinado (colaborador). */
export async function prepararUploadContratoAssinadoAdmin(input: {
  locacaoId: string;
}): Promise<PreparoContratoAssinadoAdmin | { error: string }> {
  await requireColaborador();
  const admin = createAdminClient();

  const contrato = await buscarContratoAdmin(admin, input.locacaoId);
  if (!contrato) return { error: "Contrato não encontrado." };
  if (contrato.status !== "enviado") {
    return { error: "O contrato não está aguardando assinatura." };
  }

  const path = `contratos/${input.locacaoId}/assinado/${crypto.randomUUID()}.pdf`;
  const { data, error } = await admin.storage
    .from(BUCKET_CONTRATOS)
    .createSignedUploadUrl(path);
  if (error || !data) return { error: "Não foi possível preparar o upload." };
  return { path: data.path, token: data.token };
}

/** Confere o objeto, grava e já marca a locação como contrato assinado. */
export async function confirmarContratoAssinadoAdmin(input: {
  locacaoId: string;
  path: string;
}): Promise<{ ok?: true; aviso?: string; error?: string }> {
  const { user } = await requireColaborador();
  const admin = createAdminClient();

  const contrato = await buscarContratoAdmin(admin, input.locacaoId);
  if (!contrato) return { error: "Contrato não encontrado." };
  if (contrato.status !== "enviado") {
    return { error: "O contrato não está aguardando assinatura." };
  }

  const prefixo = `contratos/${input.locacaoId}/assinado/`;
  if (!input.path.startsWith(prefixo) || input.path.includes("..")) {
    return { error: "Caminho inválido." };
  }

  const dir = input.path.slice(0, input.path.lastIndexOf("/"));
  const filename = input.path.split("/").pop() as string;
  const { data: itens } = await admin.storage
    .from(BUCKET_CONTRATOS)
    .list(dir, { search: filename, limit: 100 });
  const item = itens?.find((i) => i.name === filename);
  if (!item) return { error: "Falha no upload: arquivo não encontrado." };

  const size = (item.metadata?.size as number | undefined) ?? 0;
  if (size > MAX_BYTES) {
    await admin.storage.from(BUCKET_CONTRATOS).remove([input.path]);
    return { error: "Arquivo acima do limite permitido (8MB)." };
  }

  if (contrato.pdfAssinadoUrl && contrato.pdfAssinadoUrl !== input.path) {
    await admin.storage.from(BUCKET_CONTRATOS).remove([contrato.pdfAssinadoUrl]);
  }

  const { error } = await admin
    .from("contratos")
    .update({ pdf_assinado_url: input.path })
    .eq("id", contrato.id);
  if (error) {
    await admin.storage.from(BUCKET_CONTRATOS).remove([input.path]);
    return { error: "Não foi possível registrar o contrato assinado." };
  }

  const t = await aplicarTransicao({
    locacaoId: input.locacaoId,
    para: "contrato_assinado",
    autorUserId: user.id,
    observacao: "Assinatura presencial — contrato anexado pela ACIMM",
  });
  if ("erro" in t) {
    revalidar(input.locacaoId);
    return {
      ok: true,
      aviso: `Contrato salvo, mas não foi possível marcar como assinado: ${t.erro}`,
    };
  }

  revalidar(input.locacaoId);
  return { ok: true };
}
