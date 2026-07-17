import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";
import { confirmarFotoSala, prepararUploadFoto } from "./fotos-actions";

/**
 * Helpers de upload de foto no client (reutilizados no cadastro e na galeria).
 * A foto é comprimida no browser e enviada DIRETO ao Storage via signed URL —
 * nunca trafega pela função Vercel (Spec 04 §3.1).
 */

const BUCKET = "salas-fotos";
export const TIPOS_FOTO = ["image/jpeg", "image/png", "image/webp"];
export const MAX_FOTOS = 10;
export const MAX_BYTES = 8 * 1024 * 1024;

export async function comprimirFoto(file: File): Promise<File> {
  return imageCompression(file, {
    maxSizeMB: 2,
    maxWidthOrHeight: 1920,
    fileType: "image/webp",
    initialQuality: 0.8,
    useWebWorker: true,
  });
}

export async function subirFotoSala(
  salaId: string,
  arquivo: Blob,
): Promise<{ path: string; url: string } | { error: string }> {
  const prep = await prepararUploadFoto(salaId);
  if ("error" in prep) return prep;

  const supabase = createClient();
  const up = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(prep.path, prep.token, arquivo, {
      contentType: "image/webp",
    });
  if (up.error) return { error: "Falha no upload." };

  const conf = await confirmarFotoSala(salaId, prep.path);
  if ("error" in conf) return conf;
  return { path: prep.path, url: conf.url };
}
