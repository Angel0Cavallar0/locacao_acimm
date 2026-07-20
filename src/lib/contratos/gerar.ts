import "server-only";
import type { StatusLocacao } from "@/lib/locacoes/maquina-estados-core";
import { createAdminClient } from "@/lib/supabase/admin";
import { carregarDadosContrato } from "./dados";
import { gerarPdfContrato } from "./pdf-contrato";

/** Geração e armazenamento do contrato (Spec 13 §3). Service role. */

const BUCKET = "contratos";

// Status em que o contrato existe / pode ser (re)gerado.
const STATUS_COM_CONTRATO: StatusLocacao[] = [
  "aprovada",
  "contrato_enviado",
  "contrato_assinado",
  "aguardando_pagamento",
  "confirmada",
  "realizada",
];

export interface ResultadoGerar {
  ok?: true;
  pdfBuffer?: Buffer;
  responsavelFallback?: boolean;
  error?: string;
}

export async function gerarContrato(
  locacaoId: string,
  autorUserId: string | null,
): Promise<ResultadoGerar> {
  const admin = createAdminClient();

  const { data: loc } = await admin
    .from("locacoes")
    .select("status")
    .eq("id", locacaoId)
    .maybeSingle();
  if (!loc) return { error: "Locação não encontrada." };
  if (!STATUS_COM_CONTRATO.includes(loc.status as StatusLocacao)) {
    return { error: "O contrato só pode ser gerado a partir da aprovação." };
  }

  const { data: atual } = await admin
    .from("contratos")
    .select("id, status, pdf_url")
    .eq("locacao_id", locacaoId)
    .maybeSingle();
  if (atual?.status === "assinado") {
    return { error: "Contrato já assinado — não pode ser regenerado." };
  }

  const dados = await carregarDadosContrato(locacaoId);
  if (!dados) return { error: "Não foi possível carregar os dados da locação." };

  let pdf: Buffer;
  try {
    pdf = await gerarPdfContrato(dados);
  } catch (e) {
    console.error("[contrato] render PDF falhou:", e);
    return { error: "Falha ao gerar o PDF do contrato." };
  }

  const path = `contratos/${locacaoId}/${crypto.randomUUID()}.pdf`;
  const up = await admin.storage
    .from(BUCKET)
    .upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (up.error) {
    console.error("[contrato] upload falhou:", up.error);
    return { error: "Falha ao salvar o contrato no armazenamento." };
  }

  const { error: upErr } = await admin.from("contratos").upsert(
    {
      locacao_id: locacaoId,
      status: "pendente",
      pdf_url: path,
      autentique_id: null,
      link_assinatura: null,
      enviado_em: null,
      assinado_em: null,
    },
    { onConflict: "locacao_id" },
  );
  if (upErr) {
    await admin.storage.from(BUCKET).remove([path]);
    return { error: "Não foi possível registrar o contrato." };
  }

  // Regeneração: remove o PDF anterior (sem órfão no Storage).
  if (atual?.pdf_url && atual.pdf_url !== path) {
    await admin.storage.from(BUCKET).remove([atual.pdf_url as string]);
  }

  // Auditoria (de = para; não muda o status).
  await admin.from("locacao_eventos").insert({
    locacao_id: locacaoId,
    de: loc.status,
    para: loc.status,
    autor_user_id: autorUserId,
    observacao: atual ? "Contrato regenerado" : "Contrato gerado",
    dados: { tipo: atual ? "contrato_regerado" : "contrato_gerado" },
  });

  return {
    ok: true,
    pdfBuffer: pdf,
    responsavelFallback: dados.responsavelFallback,
  };
}

/** Baixa o PDF já armazenado (reenvio sem regenerar). */
export async function baixarPdfContrato(
  locacaoId: string,
): Promise<Buffer | null> {
  const admin = createAdminClient();
  const { data: c } = await admin
    .from("contratos")
    .select("pdf_url")
    .eq("locacao_id", locacaoId)
    .maybeSingle();
  const path = c?.pdf_url as string | null;
  if (!path) return null;
  const { data, error } = await admin.storage.from(BUCKET).download(path);
  if (error || !data) return null;
  return Buffer.from(await data.arrayBuffer());
}
