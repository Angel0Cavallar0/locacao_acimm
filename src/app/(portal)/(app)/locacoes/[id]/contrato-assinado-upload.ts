import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";
import {
  confirmarContratoAssinado,
  prepararUploadContratoAssinado,
} from "./actions";

/**
 * Upload do contrato assinado no client (revisão Spec 13). Imagem é comprimida
 * no browser (alvo ≤ 3MB) e enviada DIRETO ao Storage via signed URL; PDF vai
 * sem alteração (teto 8MB). Nada trafega pela função Vercel.
 */

const BUCKET = "contratos";
export const TIPOS_CONTRATO = ["application/pdf", "image/jpeg", "image/png"];
export const MAX_BYTES = 8 * 1024 * 1024;

export async function subirContratoAssinado(
  locacaoId: string,
  file: File,
): Promise<{ ok: true } | { error: string }> {
  if (!TIPOS_CONTRATO.includes(file.type)) {
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

  const prep = await prepararUploadContratoAssinado({ locacaoId, ext });
  if ("error" in prep) return prep;

  const supabase = createClient();
  const up = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(prep.path, prep.token, arquivo, { contentType });
  if (up.error) return { error: "Falha no upload." };

  const conf = await confirmarContratoAssinado({ locacaoId, path: prep.path });
  if (conf.error) return { error: conf.error };
  return { ok: true };
}
