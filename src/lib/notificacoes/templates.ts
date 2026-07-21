/** Layout base único dos e-mails (identidade ACIMM). Fonte única, sem imports
 * locais (mantém `templates.ts` auto-contido para o node --test). */
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

/**
 * Templates das mensagens transacionais (Spec 15 §4). Mapa `template →
 * { whatsapp?, email? }`, pt-BR, tom cordial-institucional. NUNCA mencionar
 * FacioFlow/stack (CLAUDE.md §1). Payload é um saco de strings pré-formatadas
 * (data/hora/valores já em São Paulo/BRL) — os builders só interpolam, com
 * fallbacks seguros para nunca quebrar em produção por variável faltando.
 */

export type PayloadNotificacao = Record<string, unknown>;

export interface EmailMontado {
  assunto: string;
  html: string;
}

export interface TemplateBuilders {
  whatsapp?: (p: PayloadNotificacao) => string;
  email?: (p: PayloadNotificacao) => EmailMontado;
}

/** Leitor seguro de string do payload. */
function s(p: PayloadNotificacao, chave: string, fallback = ""): string {
  const v = p[chave];
  return typeof v === "string" && v.length > 0 ? v : fallback;
}

/** Bloco de botão para o portal (só quando há link). */
function botaoPortal(link: string, rotulo = "Acompanhar no portal"): string {
  if (!link) return "";
  return `<div style="text-align:center;margin:20px 0"><a href="${link}" style="background:#123B6D;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;display:inline-block">${rotulo}</a></div>`;
}

/** Sufixo de link no WhatsApp (só quando há link). */
function linkWpp(link: string, prefixo = "Acompanhe pelo portal"): string {
  return link ? `\n\n${prefixo}: ${link}` : "";
}

function par(texto: string): string {
  return `<p style="font-size:14px;line-height:1.5">${texto}</p>`;
}
function nota(texto: string): string {
  return `<p style="font-size:13px;color:#5a6473;line-height:1.5">${texto}</p>`;
}

export const templates: Record<string, TemplateBuilders> = {
  // --- Locatário ----------------------------------------------------------
  solicitacao_recebida: {
    whatsapp: (p) =>
      `Olá, ${s(p, "nome", "tudo bem")}! Recebemos sua solicitação de locação ${s(p, "loc")} (${s(p, "salas", "sala")} · ${s(p, "data")} ${s(p, "horario")}). Ela está em análise e avisaremos assim que houver retorno.${linkWpp(s(p, "link"))}`,
    email: (p) => ({
      assunto: `Solicitação recebida — ${s(p, "loc")}`,
      html: moldura(
        `${par(`Olá, ${s(p, "nome", "tudo bem")}!`)}
         ${par(`Recebemos sua solicitação <strong>${s(p, "loc")}</strong> — ${s(p, "salas", "sala")}, ${s(p, "data")} (${s(p, "horario")}).`)}
         ${nota("Ela está <strong>em análise</strong>. Você será avisado por e-mail e WhatsApp a cada etapa.")}
         ${botaoPortal(s(p, "link"))}`,
      ),
    }),
  },

  aprovada: {
    whatsapp: (p) =>
      `Boa notícia, ${s(p, "nome", "tudo bem")}! Sua locação ${s(p, "loc")} (${s(p, "data")} ${s(p, "horario")}) foi aprovada. Em seguida enviaremos o contrato.${linkWpp(s(p, "link"))}`,
    email: (p) => ({
      assunto: `Locação aprovada — ${s(p, "loc")}`,
      html: moldura(
        `${par(`Olá, ${s(p, "nome", "tudo bem")}!`)}
         ${par(`Sua locação <strong>${s(p, "loc")}</strong> (${s(p, "salas", "sala")}, ${s(p, "data")} · ${s(p, "horario")}) foi <strong>aprovada</strong>.`)}
         ${nota("O próximo passo é o contrato — você o receberá em seguida, junto das instruções de pagamento.")}
         ${botaoPortal(s(p, "link"))}`,
      ),
    }),
  },

  recusada: {
    whatsapp: (p) =>
      `Olá, ${s(p, "nome", "tudo bem")}. Sua solicitação ${s(p, "loc")} (${s(p, "data")}) não pôde ser aprovada. Motivo: ${s(p, "motivo", "não informado")}. Para outras datas, fale com a ACIMM.`,
    email: (p) => ({
      assunto: `Sobre sua solicitação — ${s(p, "loc")}`,
      html: moldura(
        `${par(`Olá, ${s(p, "nome", "tudo bem")}.`)}
         ${par(`Sua solicitação <strong>${s(p, "loc")}</strong> (${s(p, "data")}) não pôde ser aprovada.`)}
         ${nota(`Motivo: ${s(p, "motivo", "não informado")}.`)}
         ${nota("Se quiser tentar outra data, estamos à disposição.")}`,
      ),
    }),
  },

  // Anti-duplicação (§4): no modo e-mail do contrato, o e-mail COM anexo já é a
  // comunicação — aqui só o WhatsApp avisa. No modo Autentique, ambos com o link.
  contrato_enviado: {
    whatsapp: (p) => {
      const link = s(p, "assinaturaLink");
      return link
        ? `Olá, ${s(p, "nome", "tudo bem")}! O contrato da locação ${s(p, "loc")} está pronto para assinatura: ${link}`
        : `Olá, ${s(p, "nome", "tudo bem")}! Enviamos o contrato da locação ${s(p, "loc")} para o seu e-mail. Confira, assine e devolva à ACIMM.`;
    },
    email: (p) => ({
      assunto: `Contrato para assinatura — ${s(p, "loc")}`,
      html: moldura(
        `${par(`Olá, ${s(p, "nome", "tudo bem")}!`)}
         ${par(`O contrato da locação <strong>${s(p, "loc")}</strong> está pronto para assinatura.`)}
         ${botaoPortal(s(p, "assinaturaLink"), "Assinar contrato")}`,
      ),
    }),
  },

  instrucoes_pagamento: {
    whatsapp: (p) =>
      `Olá, ${s(p, "nome", "tudo bem")}! Sua locação ${s(p, "loc")} está aguardando pagamento (${s(p, "total")}). ${s(p, "instrucoes")}${linkWpp(s(p, "link"), "Envie o comprovante pelo portal")}`,
    email: (p) => ({
      assunto: `Instruções de pagamento — ${s(p, "loc")}`,
      html: moldura(
        `${par(`Olá, ${s(p, "nome", "tudo bem")}!`)}
         ${par(`Sua locação <strong>${s(p, "loc")}</strong> está aguardando pagamento no valor de <strong>${s(p, "total")}</strong>.`)}
         ${nota(s(p, "instrucoes"))}
         ${nota("Após o pagamento, envie o comprovante pelo portal. A confirmação é feita pela ACIMM.")}
         ${botaoPortal(s(p, "link"))}`,
      ),
    }),
  },

  confirmada: {
    whatsapp: (p) =>
      `Tudo certo, ${s(p, "nome", "tudo bem")}! Sua locação ${s(p, "loc")} está confirmada: ${s(p, "salas", "sala")} · ${s(p, "data")} ${s(p, "horario")}. Até lá!${linkWpp(s(p, "link"))}`,
    email: (p) => ({
      assunto: `Locação confirmada — ${s(p, "loc")}`,
      html: moldura(
        `${par(`Olá, ${s(p, "nome", "tudo bem")}!`)}
         ${par(`Sua locação <strong>${s(p, "loc")}</strong> está <strong>confirmada</strong>.`)}
         ${nota(`${s(p, "salas", "Sala")} · ${s(p, "data")} · ${s(p, "horario")}.`)}
         ${nota("Os detalhes da agenda chegam por convite do Google Agenda no e-mail de cadastro.")}
         ${botaoPortal(s(p, "link"))}`,
      ),
    }),
  },

  cancelada: {
    whatsapp: (p) =>
      p.peloAssociado === true
        ? `Olá, ${s(p, "nome", "tudo bem")}. Confirmamos o cancelamento da sua solicitação ${s(p, "loc")} (${s(p, "data")}). Se precisar, é só solicitar novamente.`
        : `Olá, ${s(p, "nome", "tudo bem")}. Sua locação ${s(p, "loc")} (${s(p, "data")}) foi cancelada. Motivo: ${s(p, "motivo", "não informado")}. Em caso de dúvida, fale com a ACIMM.`,
    email: (p) => ({
      assunto:
        p.peloAssociado === true
          ? `Cancelamento confirmado — ${s(p, "loc")}`
          : `Locação cancelada — ${s(p, "loc")}`,
      html: moldura(
        p.peloAssociado === true
          ? `${par(`Olá, ${s(p, "nome", "tudo bem")}.`)}
             ${par(`Confirmamos o <strong>cancelamento</strong> da sua solicitação <strong>${s(p, "loc")}</strong> (${s(p, "data")}).`)}
             ${nota("Quando quiser, é só fazer uma nova solicitação.")}`
          : `${par(`Olá, ${s(p, "nome", "tudo bem")}.`)}
             ${par(`Sua locação <strong>${s(p, "loc")}</strong> (${s(p, "data")}) foi <strong>cancelada</strong>.`)}
             ${nota(`Motivo: ${s(p, "motivo", "não informado")}.`)}`,
      ),
    }),
  },

  lembrete_pre_evento: {
    whatsapp: (p) =>
      `Olá, ${s(p, "nome", "tudo bem")}! Lembrete: sua locação ${s(p, "loc")} é ${s(p, "data")} às ${s(p, "horario")} (${s(p, "salas", "sala")}). Até breve!${linkWpp(s(p, "link"))}`,
    email: (p) => ({
      assunto: `Lembrete da sua locação — ${s(p, "loc")}`,
      html: moldura(
        `${par(`Olá, ${s(p, "nome", "tudo bem")}!`)}
         ${par(`Passando para lembrar da sua locação <strong>${s(p, "loc")}</strong>.`)}
         ${nota(`${s(p, "salas", "Sala")} · ${s(p, "data")} · ${s(p, "horario")}.`)}
         ${botaoPortal(s(p, "link"))}`,
      ),
    }),
  },

  // Documento (PDF de compras) — WhatsApp com mídia; o texto é a legenda (§16).
  coffee_pdf: {
    whatsapp: (p) =>
      `Lista de compras do coffee break — semana ${s(p, "rotulo")}. ${s(p, "qtd", "0")} pedido(s) firme(s). Segue o PDF.`,
  },

  // --- Internas (ACIMM) — só e-mail (§5) ----------------------------------
  interna_nova_solicitacao: {
    email: (p) => ({
      assunto: `Nova solicitação ${s(p, "loc")} aguardando análise`,
      html: moldura(
        `${par(`Nova solicitação de locação <strong>${s(p, "loc")}</strong> aguardando análise.`)}
         ${nota(`Solicitante: ${s(p, "nome", "—")}<br>${s(p, "salas", "Sala")} · ${s(p, "data")} · ${s(p, "horario")}<br>Valor: ${s(p, "total")}`)}
         ${botaoPortal(s(p, "linkAdmin"), "Abrir no painel")}`,
      ),
    }),
  },

  interna_comprovante_recebido: {
    email: (p) => ({
      assunto: `Comprovante recebido — ${s(p, "loc")}`,
      html: moldura(
        `${par(`Comprovante de pagamento recebido na locação <strong>${s(p, "loc")}</strong>.`)}
         ${nota(`Locatário: ${s(p, "nome", "—")}.`)}
         ${botaoPortal(s(p, "linkAdmin"), "Conferir no painel")}`,
      ),
    }),
  },

  // Vaga liberada (Spec 19 §6): uma locação bloqueante caiu (recusa/cancelamento/
  // remanejamento) e há fila para a sala/data. Só e-mail interno — a equipe é
  // quem contata o interessado (nenhum disparo automático ao associado).
  interna_vaga_liberada: {
    email: (p) => ({
      assunto: `Vaga liberada — ${s(p, "sala")} em ${s(p, "data")}`,
      html: moldura(
        `${par(`Um horário foi liberado em <strong>${s(p, "sala")}</strong> no dia <strong>${s(p, "data")}</strong>.`)}
         ${nota(`${s(p, "qtd", "0")} interessado(s) na fila de espera.<br>Primeiro da fila: <strong>${s(p, "primeiro", "—")}</strong>.`)}
         ${botaoPortal(s(p, "linkAdmin"), "Abrir a lista de espera")}`,
      ),
    }),
  },
};
