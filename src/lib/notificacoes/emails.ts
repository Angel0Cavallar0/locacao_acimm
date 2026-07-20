/**
 * Templates de e-mail (HTML) transacionais (CLAUDE.md §6.5).
 * Texto sempre em pt-BR; JAMAIS mencionar FacioFlow/stack (§1).
 */

import { moldura } from "./templates";

export interface EmailMontado {
  assunto: string;
  html: string;
}

/** Contrato de locação — envio pós-aprovação com PDF anexo (Spec 13 §6). */
export function emailContrato(params: {
  locatarioNome: string;
  numero: number;
  dataEvento: string;
  linkPortal: string | null;
}): EmailMontado {
  const rot = `LOC-${String(params.numero).padStart(6, "0")}`;
  const botao = params.linkPortal
    ? `<div style="text-align:center;margin:20px 0"><a href="${params.linkPortal}" style="background:#123B6D;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;display:inline-block">Acompanhar no portal</a></div>`
    : "";
  return {
    assunto: `Contrato de locação — ${rot}`,
    html: moldura(
      `<p style="font-size:14px;line-height:1.5">Olá, ${params.locatarioNome}!</p>
       <p style="font-size:14px;line-height:1.5">Sua locação <strong>${rot}</strong> (${params.dataEvento}) foi aprovada. O contrato segue <strong>anexado em PDF</strong> a este e-mail.</p>
       <p style="font-size:13px;color:#5a6473">Confira as informações, assine e devolva o documento à ACIMM. Em seguida você receberá as instruções de pagamento.</p>
       ${botao}`,
    ),
  };
}

/** Código de verificação do primeiro acesso do associado (Spec 09). */
export function emailCodigoVerificacao(codigo: string): EmailMontado {
  return {
    assunto: `Seu código de acesso: ${codigo}`,
    html: moldura(
      `<p style="font-size:14px;line-height:1.5">Use o código abaixo para concluir seu primeiro acesso ao sistema de locação de salas:</p>
       <div style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#123B6D;text-align:center;margin:20px 0">${codigo}</div>
       <p style="font-size:13px;color:#5a6473">O código expira em 15 minutos. Não compartilhe com ninguém.</p>`,
    ),
  };
}
