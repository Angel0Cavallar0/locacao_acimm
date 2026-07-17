"use server";

import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";

const BUCKET = "salas-fotos";
const MAX_FOTOS = 10;
const MAX_BYTES = 8 * 1024 * 1024; // 8MB (teto de rejeição pós-compressão)

export interface PreparoUpload {
  path: string;
  token: string;
  signedUrl: string;
}

function pertenceASala(path: string, salaId: string): boolean {
  return path.startsWith(`salas/${salaId}/`) && !path.includes("..");
}

async function fotosDaSala(salaId: string): Promise<string[] | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("salas")
    .select("fotos")
    .eq("id", salaId)
    .maybeSingle();
  return (data?.fotos as string[] | undefined) ?? null;
}

/** Gera URL assinada para upload direto ao Storage (foto não passa pela Vercel). */
export async function prepararUploadFoto(
  salaId: string,
): Promise<PreparoUpload | { error: string }> {
  await requireColaborador();

  const fotos = await fotosDaSala(salaId);
  if (fotos === null) return { error: "Sala não encontrada." };
  if (fotos.length >= MAX_FOTOS) {
    return { error: `Limite de ${MAX_FOTOS} fotos por sala atingido.` };
  }

  const admin = createAdminClient();
  const path = `salas/${salaId}/${crypto.randomUUID()}.webp`;
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) return { error: "Não foi possível preparar o upload." };
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

/** Confere o objeto no Storage (existe e ≤ 8MB) e registra em salas.fotos. */
export async function confirmarFotoSala(
  salaId: string,
  path: string,
): Promise<{ url: string } | { error: string }> {
  await requireColaborador();
  if (!pertenceASala(path, salaId)) return { error: "Caminho inválido." };

  const admin = createAdminClient();
  const filename = path.split("/").pop() as string;

  const { data: itens } = await admin.storage
    .from(BUCKET)
    .list(`salas/${salaId}`, { search: filename, limit: 100 });
  const item = itens?.find((i) => i.name === filename);
  if (!item) return { error: "Falha no upload: arquivo não encontrado." };

  const size = (item.metadata?.size as number | undefined) ?? 0;
  if (size > MAX_BYTES) {
    // Defesa contra client adulterado: remove e rejeita.
    await admin.storage.from(BUCKET).remove([path]);
    return { error: "Arquivo acima do limite permitido." };
  }

  const fotos = await fotosDaSala(salaId);
  if (fotos === null) {
    await admin.storage.from(BUCKET).remove([path]);
    return { error: "Sala não encontrada." };
  }
  if (fotos.includes(path)) {
    const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
    return { url: pub.publicUrl };
  }
  if (fotos.length >= MAX_FOTOS) {
    await admin.storage.from(BUCKET).remove([path]);
    return { error: `Limite de ${MAX_FOTOS} fotos por sala atingido.` };
  }

  const { error } = await admin
    .from("salas")
    .update({ fotos: [...fotos, path] })
    .eq("id", salaId);
  if (error) {
    await admin.storage.from(BUCKET).remove([path]);
    return { error: "Não foi possível registrar a foto." };
  }

  revalidatePath(`/admin/salas/${salaId}`);
  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  return { url: pub.publicUrl };
}

export async function removerFotoSala(
  salaId: string,
  path: string,
): Promise<{ error?: string }> {
  await requireColaborador();
  if (!pertenceASala(path, salaId)) return { error: "Caminho inválido." };

  const fotos = await fotosDaSala(salaId);
  if (fotos === null) return { error: "Sala não encontrada." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("salas")
    .update({ fotos: fotos.filter((f) => f !== path) })
    .eq("id", salaId);
  if (error) return { error: "Não foi possível remover a foto." };

  await admin.storage.from(BUCKET).remove([path]);
  revalidatePath(`/admin/salas/${salaId}`);
  return {};
}

/** Reordena (primeira = capa). `novaOrdem` deve ser permutação das fotos atuais. */
export async function reordenarFotosSala(
  salaId: string,
  novaOrdem: string[],
): Promise<{ error?: string }> {
  await requireColaborador();

  const fotos = await fotosDaSala(salaId);
  if (fotos === null) return { error: "Sala não encontrada." };

  const mesmoConjunto =
    fotos.length === novaOrdem.length &&
    [...fotos].sort().join("|") === [...novaOrdem].sort().join("|");
  if (!mesmoConjunto) return { error: "Ordem inválida." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("salas")
    .update({ fotos: novaOrdem })
    .eq("id", salaId);
  if (error) return { error: "Não foi possível reordenar." };

  revalidatePath(`/admin/salas/${salaId}`);
  return {};
}
