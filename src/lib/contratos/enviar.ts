import "server-only";
import { aplicarTransicao } from "@/lib/locacoes/maquina-estados";
import { enfileirarContratoWhatsapp } from "@/lib/notificacoes/eventos";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Envio do contrato ao locatário por WhatsApp (Ciclo 2 / Spec 30 §4.1). O
 * Autentique saiu do fluxo; o e-mail do cadastro não é confiável (financeiro/RH).
 * O PDF vai como documento de WhatsApp para o telefone do locatário. Falhas nunca
 * quebram o fluxo — devolvem `aviso`/`error` e o fluxo manual (baixar + marcar
 * assinado) cobre.
 */

export interface ResultadoEnviar {
  ok?: true;
  aviso?: string;
  error?: string;
}

export async function enviarContrato(
  locacaoId: string,
  autorUserId: string | null,
  _opts: { pdfBuffer?: Buffer } = {},
): Promise<ResultadoEnviar> {
  const admin = createAdminClient();

  const { data: loc } = await admin
    .from("locacoes")
    .select("status")
    .eq("id", locacaoId)
    .maybeSingle();
  if (!loc) return { error: "Locação não encontrada." };

  const { data: contrato } = await admin
    .from("contratos")
    .select("id")
    .eq("locacao_id", locacaoId)
    .maybeSingle();
  if (!contrato) return { error: "Gere o contrato antes de enviar." };

  const env = await enfileirarContratoWhatsapp(locacaoId);
  if (!env.ok) {
    return { aviso: `${env.erro} Baixe o contrato e envie manualmente.` };
  }

  await admin
    .from("contratos")
    .update({ status: "enviado", enviado_em: new Date().toISOString() })
    .eq("id", contrato.id);

  // Primeiro envio: transiciona (Sistema). Reenvio: só registra o evento.
  if (loc.status === "aprovada") {
    await aplicarTransicao({
      locacaoId,
      para: "contrato_enviado",
      autorUserId: null,
      observacao: "Contrato enviado por WhatsApp",
    });
  } else {
    await admin.from("locacao_eventos").insert({
      locacao_id: locacaoId,
      de: loc.status,
      para: loc.status,
      autor_user_id: autorUserId,
      observacao: "Contrato reenviado por WhatsApp",
      dados: { tipo: "contrato_reenviado" },
    });
  }

  return { ok: true };
}
