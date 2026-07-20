/**
 * Templates de e-mail (HTML) transacionais (CLAUDE.md §6.5).
 * Texto sempre em pt-BR; JAMAIS mencionar FacioFlow/stack (§1).
 */

export interface EmailMontado {
  assunto: string;
  html: string;
}

function moldura(conteudo: string): string {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#f4f5f7;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#1f2430">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
      <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;padding:28px" cellpadding="0" cellspacing="0">
        <tr><td>
          <div style="font-size:18px;font-weight:bold;color:#123B6D;margin-bottom:16px">ACIMM · Locação de Salas</div>
          ${conteudo}
          <div style="margin-top:24px;font-size:12px;color:#8a94a6">Se você não solicitou este e-mail, ignore-o.</div>
        </td></tr>
      </table>
    </td></tr></table>
  </body></html>`;
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
