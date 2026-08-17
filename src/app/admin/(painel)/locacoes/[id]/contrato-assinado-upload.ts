import { createClient } from "@/lib/supabase/client";
import {
  confirmarContratoAssinadoAdmin,
  prepararUploadContratoAssinadoAdmin,
} from "@/app/admin/(painel)/contratos/actions";

/**
 * Upload do contrato assinado presencialmente, feito pelo colaborador (caso
 * de associado que assina na sede em vez de reenviar pelo Portal). Só PDF,
 * sem compressão — vai direto ao Storage via signed URL.
 */

const BUCKET = "contratos";
export const MAX_BYTES = 8 * 1024 * 1024;

export async function subirContratoAssinadoAdmin(
  locacaoId: string,
  file: File,
): Promise<{ ok: true; aviso?: string } | { error: string }> {
  if (file.type !== "application/pdf") {
    return { error: "Envie um arquivo PDF." };
  }
  if (file.size > MAX_BYTES) {
    return { error: "O PDF está acima do limite de 8MB." };
  }

  const prep = await prepararUploadContratoAssinadoAdmin({ locacaoId });
  if ("error" in prep) return prep;

  const supabase = createClient();
  const up = await supabase.storage
    .from(BUCKET)
    .uploadToSignedUrl(prep.path, prep.token, file, {
      contentType: "application/pdf",
    });
  if (up.error) return { error: "Falha no upload." };

  const conf = await confirmarContratoAssinadoAdmin({
    locacaoId,
    path: prep.path,
  });
  if (conf.error) return { error: conf.error };
  return { ok: true, aviso: conf.aviso };
}
