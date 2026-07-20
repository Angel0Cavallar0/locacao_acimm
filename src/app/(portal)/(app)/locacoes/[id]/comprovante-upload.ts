import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";
import { confirmarComprovante, prepararUploadComprovante } from "./actions";

/**
 * Upload de comprovante no client (Spec 12 §4). Imagem é comprimida no browser
 * (alvo ≤ 3MB) e enviada DIRETO ao Storage via signed URL — nunca trafega pela
 * função Vercel. PDF vai sem alteração (teto 8MB).
 */

const BUCKET = "comprovantes";
export const TIPOS_COMPROVANTE = ["application/pdf", "image/jpeg", "image/png"];
export const MAX_BYTES = 8 * 1024 * 1024;

export async function subirComprovante(
  pagamentoId: string,
  file: File,
): Promise<{ ok: true } | { error: string }> {
  if (!TIPOS_COMPROVANTE.includes(file.type)) {
    return { error: "Use PDF, JPG ou PNG." };
  }

  let arquivo: Blob = file;
  let ext = "pdf";
  let contentType = file.type;

  if (file.type.startsWith("image/")) {
    arquivo = await imageCompression(file, {
      maxSizeMB: 3,
      maxWidthOrHeight: 2400,
      fileType: "image/jpeg",
      initialQuality: 0.85,
      useWebWorker: true,
    });
    ext = "jpg";
    contentType = "image/jpeg";
  } else if (file.size > MAX_BYTES) {
    return { error: "O PDF está acima do limite de 8MB." };
  }

  const prep = await prepararUploadComprovante({ pagamentoId, ext });
  if ("error" in prep) return prep;

  const supabase = createClient();
  const up = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(prep.path, prep.token, arquivo, { contentType });
  if (up.error) return { error: "Falha no upload." };

  const conf = await confirmarComprovante({ pagamentoId, path: prep.path });
  if (conf.error) return { error: conf.error };
  return { ok: true };
}
