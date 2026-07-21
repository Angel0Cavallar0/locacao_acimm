/** Layout base único dos e-mails (identidade ACIMM). Fonte única, sem imports
 * locais (mantém auto-contido para o node --test). Os textos dos templates
 * agora vivem em `templates-padrao.ts` (editáveis) e são renderizados por
 * `render-core`; aqui ficam só os helpers de layout HTML. */
export function moldura(conteudo: string): string {
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

export type PayloadNotificacao = Record<string, unknown>;

export interface EmailMontado {
  assunto: string;
  html: string;
}

/** Leitor seguro de string do payload. */
export function s(p: PayloadNotificacao, chave: string, fallback = ""): string {
  const v = p[chave];
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

/** Bloco de botão para o portal (só quando há link). */
export function botaoPortal(link: string, rotulo = "Acompanhar no portal"): string {
  if (!link) return "";
  return `<div style="text-align:center;margin:20px 0"><a href="${link}" style="background:#123B6D;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;display:inline-block">${rotulo}</a></div>`;
}

function par(texto: string): string {
  return `<p style="font-size:14px;line-height:1.5">${texto}</p>`;
}

/**
 * Monta o HTML do e-mail a partir do corpo em TEXTO (já renderizado): cada
 * linha em branco vira um parágrafo; quebras simples viram `<br>`. Anexa o botão
 * do portal (quando houver) e envolve tudo na moldura da ACIMM.
 */
export function montarEmailHtml(corpoTexto: string, botaoHtml = ""): string {
  const paragrafos = corpoTexto
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => par(p.replace(/\n/g, "<br>")))
    .join("");
  return moldura(paragrafos + botaoHtml);
}
