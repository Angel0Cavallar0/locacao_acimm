"use server";

import { revalidatePath } from "next/cache";
import { requireAssociado } from "@/lib/auth/guards";
import { aplicarTransicao } from "@/lib/locacoes/maquina-estados";
import type { StatusLocacao } from "@/lib/locacoes/maquina-estados-core";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

const BUCKET = "comprovantes";
const MAX_BYTES = 8 * 1024 * 1024;
const CANCELAVEIS: StatusLocacao[] = ["solicitada", "em_analise"];
const EXTENSOES: Record<string, string> = {
  pdf: "pdf",
  jpg: "jpg",
  jpeg: "jpg",
  png: "png",
};

function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

interface PagamentoPosse {
  locacaoId: string;
  status: string;
  comprovanteUrl: string | null;
  locacaoStatus: StatusLocacao;
}

/** Verifica que o pagamento pertence a uma locação do associado logado. */
async function pagamentoDoAssociado(
  admin: Admin,
  pagamentoId: string,
  associadoId: string,
): Promise<PagamentoPosse | null> {
  const { data } = await admin
    .from("pagamentos")
    .select(
      "id, status, comprovante_url, locacao_id, locacoes ( associado_id, status )",
    )
    .eq("id", pagamentoId)
    .maybeSingle();
  if (!data) return null;
  const loc = um(
    data.locacoes as
      | { associado_id: string | null; status: StatusLocacao }
      | { associado_id: string | null; status: StatusLocacao }[]
      | null,
  );
  if (!loc || loc.associado_id !== associadoId) return null;
  return {
    locacaoId: data.locacao_id as string,
    status: data.status as string,
    comprovanteUrl: (data.comprovante_url as string | null) ?? null,
    locacaoStatus: loc.status,
  };
}

export interface PreparoComprovante {
  path: string;
  token: string;
  signedUrl: string;
}

/** URL assinada para upload direto do comprovante (não passa pela Vercel — §4). */
export async function prepararUploadComprovante(input: {
  pagamentoId: string;
  ext: string;
}): Promise<PreparoComprovante | { error: string }> {
  const { associado } = await requireAssociado();
  const ext = EXTENSOES[input.ext.toLowerCase()];
  if (!ext) return { error: "Formato não suportado (use PDF, JPG ou PNG)." };

  const admin = createAdminClient();
  const posse = await pagamentoDoAssociado(admin, input.pagamentoId, associado.id);
  if (!posse) return { error: "Pagamento não encontrado." };
  if (posse.status !== "pendente") {
    return { error: "Este pagamento não está mais pendente." };
  }

  const path = `comprovantes/${posse.locacaoId}/${input.pagamentoId}/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);
  if (error || !data) return { error: "Não foi possível preparar o upload." };
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

/** Confere o objeto (existe, ≤ 8MB), grava e registra na linha do tempo (§4). */
export async function confirmarComprovante(input: {
  pagamentoId: string;
  path: string;
}): Promise<{ ok?: true; error?: string }> {
  const { user, associado } = await requireAssociado();
  const admin = createAdminClient();

  const posse = await pagamentoDoAssociado(admin, input.pagamentoId, associado.id);
  if (!posse) return { error: "Pagamento não encontrado." };
  if (posse.status !== "pendente") {
    return { error: "Este pagamento não está mais pendente." };
  }

  const prefixo = `comprovantes/${posse.locacaoId}/${input.pagamentoId}/`;
  if (!input.path.startsWith(prefixo) || input.path.includes("..")) {
    return { error: "Caminho inválido." };
  }

  const dir = input.path.slice(0, input.path.lastIndexOf("/"));
  const filename = input.path.split("/").pop() as string;
  const { data: itens } = await admin.storage
    .from(BUCKET)
    .list(dir, { search: filename, limit: 100 });
  const item = itens?.find((i) => i.name === filename);
  if (!item) return { error: "Falha no upload: arquivo não encontrado." };

  const size = (item.metadata?.size as number | undefined) ?? 0;
  if (size > MAX_BYTES) {
    await admin.storage.from(BUCKET).remove([input.path]);
    return { error: "Arquivo acima do limite permitido (8MB)." };
  }

  // Substituição: remove o comprovante anterior do Storage.
  if (posse.comprovanteUrl && posse.comprovanteUrl !== input.path) {
    await admin.storage.from(BUCKET).remove([posse.comprovanteUrl]);
  }

  const { error } = await admin
    .from("pagamentos")
    .update({ comprovante_url: input.path })
    .eq("id", input.pagamentoId);
  if (error) {
    await admin.storage.from(BUCKET).remove([input.path]);
    return { error: "Não foi possível registrar o comprovante." };
  }

  // Linha do tempo: evento de comprovante (de=para; sem mudança de status).
  await admin.from("locacao_eventos").insert({
    locacao_id: posse.locacaoId,
    de: posse.locacaoStatus,
    para: posse.locacaoStatus,
    autor_user_id: user.id,
    observacao: "Comprovante enviado",
    dados: { tipo: "comprovante_enviado" },
  });

  // Aviso interno à ACIMM: comprovante recebido (Spec 15 §5).
  const { notificarComprovanteRecebido } = await import(
    "@/lib/notificacoes/eventos"
  );
  await notificarComprovanteRecebido(posse.locacaoId);

  revalidatePath(`/locacoes/${posse.locacaoId}`);
  revalidatePath("/admin/locacoes");
  return { ok: true };
}

/** Remove o comprovante (permitido enquanto o pagamento estiver pendente). */
export async function removerComprovante(input: {
  pagamentoId: string;
}): Promise<{ ok?: true; error?: string }> {
  const { associado } = await requireAssociado();
  const admin = createAdminClient();

  const posse = await pagamentoDoAssociado(admin, input.pagamentoId, associado.id);
  if (!posse) return { error: "Pagamento não encontrado." };
  if (posse.status !== "pendente") {
    return { error: "Este pagamento não está mais pendente." };
  }
  if (!posse.comprovanteUrl) return { ok: true };

  await admin
    .from("pagamentos")
    .update({ comprovante_url: null })
    .eq("id", input.pagamentoId);
  await admin.storage.from(BUCKET).remove([posse.comprovanteUrl]);

  revalidatePath(`/locacoes/${posse.locacaoId}`);
  return { ok: true };
}

/** URL assinada de curta duração para visualizar o comprovante (bucket privado). */
export async function urlComprovante(
  pagamentoId: string,
): Promise<{ url: string } | { error: string }> {
  const { associado } = await requireAssociado();
  const admin = createAdminClient();
  const posse = await pagamentoDoAssociado(admin, pagamentoId, associado.id);
  if (!posse || !posse.comprovanteUrl) {
    return { error: "Comprovante não encontrado." };
  }
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(posse.comprovanteUrl, 300);
  if (error || !data) return { error: "Não foi possível abrir o comprovante." };
  return { url: data.signedUrl };
}

/** URL assinada de curta duração para baixar o PDF do contrato (bucket privado). */
export async function urlContrato(
  locacaoId: string,
): Promise<{ url: string } | { error: string }> {
  const { associado } = await requireAssociado();
  const admin = createAdminClient();

  const { data: loc } = await admin
    .from("locacoes")
    .select("associado_id")
    .eq("id", locacaoId)
    .maybeSingle();
  if (!loc || loc.associado_id !== associado.id) {
    return { error: "Contrato não encontrado." };
  }

  const { data: contrato } = await admin
    .from("contratos")
    .select("pdf_url")
    .eq("locacao_id", locacaoId)
    .maybeSingle();
  const pdf = contrato?.pdf_url as string | null | undefined;
  if (!pdf) return { error: "Contrato ainda não disponível." };

  const { data, error } = await admin.storage
    .from("contratos")
    .createSignedUrl(pdf, 300);
  if (error || !data) return { error: "Não foi possível abrir o contrato." };
  return { url: data.signedUrl };
}

// ---------------------------------------------------------------------------
// Contrato assinado — o associado baixa, assina e envia o assinado de volta.
// ---------------------------------------------------------------------------

const BUCKET_CONTRATOS = "contratos";

interface ContratoPosse {
  contratoId: string;
  status: string;
  pdfAssinadoUrl: string | null;
  locacaoStatus: StatusLocacao;
}

async function contratoDoAssociado(
  admin: Admin,
  locacaoId: string,
  associadoId: string,
): Promise<ContratoPosse | null> {
  const { data: loc } = await admin
    .from("locacoes")
    .select("associado_id, status")
    .eq("id", locacaoId)
    .maybeSingle();
  if (!loc || loc.associado_id !== associadoId) return null;
  const { data: c } = await admin
    .from("contratos")
    .select("id, status, pdf_assinado_url")
    .eq("locacao_id", locacaoId)
    .maybeSingle();
  if (!c) return null;
  return {
    contratoId: c.id as string,
    status: c.status as string,
    pdfAssinadoUrl: (c.pdf_assinado_url as string | null) ?? null,
    locacaoStatus: loc.status as StatusLocacao,
  };
}

export interface PreparoContratoAssinado {
  path: string;
  token: string;
  signedUrl: string;
}

/** URL assinada para upload direto do contrato assinado (bucket privado). */
export async function prepararUploadContratoAssinado(input: {
  locacaoId: string;
  ext: string;
}): Promise<PreparoContratoAssinado | { error: string }> {
  const { associado } = await requireAssociado();
  const ext = EXTENSOES[input.ext.toLowerCase()];
  if (!ext) return { error: "Formato não suportado (use PDF, JPG ou PNG)." };

  const admin = createAdminClient();
  const posse = await contratoDoAssociado(admin, input.locacaoId, associado.id);
  if (!posse) return { error: "Contrato não encontrado." };
  if (posse.status !== "enviado") {
    return { error: "O contrato não está aguardando assinatura." };
  }

  const path = `contratos/${input.locacaoId}/assinado/${crypto.randomUUID()}.${ext}`;
  const { data, error } = await admin.storage
    .from(BUCKET_CONTRATOS)
    .createSignedUploadUrl(path);
  if (error || !data) return { error: "Não foi possível preparar o upload." };
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

/** Confere o objeto, grava e registra na linha do tempo. */
export async function confirmarContratoAssinado(input: {
  locacaoId: string;
  path: string;
}): Promise<{ ok?: true; error?: string }> {
  const { user, associado } = await requireAssociado();
  const admin = createAdminClient();

  const posse = await contratoDoAssociado(admin, input.locacaoId, associado.id);
  if (!posse) return { error: "Contrato não encontrado." };
  if (posse.status !== "enviado") {
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

  if (posse.pdfAssinadoUrl && posse.pdfAssinadoUrl !== input.path) {
    await admin.storage.from(BUCKET_CONTRATOS).remove([posse.pdfAssinadoUrl]);
  }

  const { error } = await admin
    .from("contratos")
    .update({ pdf_assinado_url: input.path })
    .eq("id", posse.contratoId);
  if (error) {
    await admin.storage.from(BUCKET_CONTRATOS).remove([input.path]);
    return { error: "Não foi possível registrar o contrato assinado." };
  }

  await admin.from("locacao_eventos").insert({
    locacao_id: input.locacaoId,
    de: posse.locacaoStatus,
    para: posse.locacaoStatus,
    autor_user_id: user.id,
    observacao: "Contrato assinado enviado",
    dados: { tipo: "contrato_assinado_enviado" },
  });

  // Hook de notificação ao colaborador — no-op até o Spec 15.
  console.info(`[contrato-assinado] locacao=${input.locacaoId} enviado`);

  revalidatePath(`/locacoes/${input.locacaoId}`);
  revalidatePath(`/admin/locacoes/${input.locacaoId}`);
  revalidatePath("/admin/contratos");
  return { ok: true };
}

/** Remove o contrato assinado (enquanto aguarda assinatura, para reenviar). */
export async function removerContratoAssinado(input: {
  locacaoId: string;
}): Promise<{ ok?: true; error?: string }> {
  const { associado } = await requireAssociado();
  const admin = createAdminClient();

  const posse = await contratoDoAssociado(admin, input.locacaoId, associado.id);
  if (!posse) return { error: "Contrato não encontrado." };
  if (posse.status !== "enviado") {
    return { error: "O contrato não está aguardando assinatura." };
  }
  if (!posse.pdfAssinadoUrl) return { ok: true };

  await admin
    .from("contratos")
    .update({ pdf_assinado_url: null })
    .eq("id", posse.contratoId);
  await admin.storage.from(BUCKET_CONTRATOS).remove([posse.pdfAssinadoUrl]);

  revalidatePath(`/locacoes/${input.locacaoId}`);
  return { ok: true };
}

/** URL assinada de curta duração para o associado rever o que enviou. */
export async function urlContratoAssinado(
  locacaoId: string,
): Promise<{ url: string } | { error: string }> {
  const { associado } = await requireAssociado();
  const admin = createAdminClient();
  const posse = await contratoDoAssociado(admin, locacaoId, associado.id);
  if (!posse || !posse.pdfAssinadoUrl) {
    return { error: "Contrato assinado não encontrado." };
  }
  const { data, error } = await admin.storage
    .from(BUCKET_CONTRATOS)
    .createSignedUrl(posse.pdfAssinadoUrl, 300);
  if (error || !data) return { error: "Não foi possível abrir o contrato." };
  return { url: data.signedUrl };
}

/** Cancelamento pelo associado — só em solicitada/em_analise (§5). */
export async function cancelarSolicitacao(input: {
  locacaoId: string;
  motivo: string;
}): Promise<{ ok?: true; error?: string }> {
  const { user, associado } = await requireAssociado();
  const admin = createAdminClient();

  const { data: loc } = await admin
    .from("locacoes")
    .select("status, associado_id")
    .eq("id", input.locacaoId)
    .maybeSingle();
  if (!loc || loc.associado_id !== associado.id) {
    return { error: "Locação não encontrada." };
  }
  if (!CANCELAVEIS.includes(loc.status as StatusLocacao)) {
    return {
      error: "Esta solicitação não pode mais ser cancelada aqui. Fale com a ACIMM.",
    };
  }

  const motivo = input.motivo?.trim() || "Cancelada pelo associado";
  const r = await aplicarTransicao({
    locacaoId: input.locacaoId,
    para: "cancelada",
    autorUserId: user.id,
    motivo,
  });
  if ("erro" in r) return { error: r.erro };

  revalidatePath("/locacoes");
  revalidatePath(`/locacoes/${input.locacaoId}`);
  revalidatePath("/admin/locacoes");
  revalidatePath("/admin/calendario");
  revalidatePath("/admin");
  return { ok: true };
}
