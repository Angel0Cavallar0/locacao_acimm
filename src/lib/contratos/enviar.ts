import "server-only";
import { dataSP } from "@/lib/calendario/tempo";
import { envCore } from "@/lib/env";
import { enviarEmail, isResendConfigured } from "@/lib/integracoes/resend";
import { aplicarTransicao } from "@/lib/locacoes/maquina-estados";
import { emailContrato } from "@/lib/notificacoes/emails";
import { createAdminClient } from "@/lib/supabase/admin";
import { baixarPdfContrato } from "./gerar";
import { parsearModoEnvio } from "./tipos";

/**
 * Envio do contrato ao locatário (Spec 13 §6). Nesta fase só o modo E-MAIL
 * (Resend) está ativo; Autentique fica indisponível até o token chegar.
 * Falhas nunca quebram o fluxo — devolvem `aviso`/`error` para o detalhe.
 */

export interface ResultadoEnviar {
  ok?: true;
  aviso?: string;
  error?: string;
}

function rot(numero: number): string {
  return `LOC-${String(numero).padStart(6, "0")}`;
}

export async function enviarContrato(
  locacaoId: string,
  autorUserId: string | null,
  opts: { pdfBuffer?: Buffer } = {},
): Promise<ResultadoEnviar> {
  const admin = createAdminClient();

  const { data: loc } = await admin
    .from("locacoes")
    .select(
      "status, numero, locatario_nome, locatario_email, associado_id, inicio",
    )
    .eq("id", locacaoId)
    .maybeSingle();
  if (!loc) return { error: "Locação não encontrada." };

  const { data: contrato } = await admin
    .from("contratos")
    .select("id, status")
    .eq("locacao_id", locacaoId)
    .maybeSingle();
  if (!contrato) return { error: "Gere o contrato antes de enviar." };

  const { data: cfg } = await admin
    .from("configuracoes")
    .select("valor")
    .eq("chave", "modo_envio_contrato")
    .maybeSingle();
  const modo = parsearModoEnvio(cfg?.valor);

  if (modo === "autentique") {
    // Estruturado, porém indisponível até as credenciais chegarem (§7).
    return {
      aviso:
        "Modo Autentique ainda não disponível. Baixe o contrato e envie manualmente.",
    };
  }

  // Modo e-mail
  if (!isResendConfigured()) {
    return {
      aviso:
        "Envio por e-mail não configurado. Contrato gerado — baixe e envie manualmente.",
    };
  }
  if (!loc.locatario_email) {
    return {
      aviso: "Locatário sem e-mail cadastrado. Baixe e envie manualmente.",
    };
  }

  const pdf = opts.pdfBuffer ?? (await baixarPdfContrato(locacaoId));
  if (!pdf) return { error: "PDF do contrato não encontrado." };

  const linkPortal = loc.associado_id
    ? `${envCore.APP_URL}/locacoes/${locacaoId}`
    : null;
  const { assunto, html } = emailContrato({
    locatarioNome: loc.locatario_nome,
    numero: loc.numero,
    dataEvento: dataSP(loc.inicio),
    linkPortal,
  });

  try {
    await enviarEmail({
      para: loc.locatario_email,
      assunto,
      html,
      anexos: [
        { filename: `contrato-${rot(loc.numero)}.pdf`, content: pdf.toString("base64") },
      ],
    });
  } catch (e) {
    console.error("[contrato] envio e-mail falhou:", e);
    return { error: "Falha ao enviar o e-mail do contrato." };
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
      observacao: "Contrato enviado por e-mail",
    });
  } else {
    await admin.from("locacao_eventos").insert({
      locacao_id: locacaoId,
      de: loc.status,
      para: loc.status,
      autor_user_id: autorUserId,
      observacao: "Contrato reenviado por e-mail",
      dados: { tipo: "contrato_reenviado" },
    });
  }

  return { ok: true };
}
