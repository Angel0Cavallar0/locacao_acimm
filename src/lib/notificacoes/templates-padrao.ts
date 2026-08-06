/**
 * Textos-padrão dos templates de mensagem (Spec 25 §C). É a ÚNICA fonte do
 * conteúdo default e o fallback do envio quando não há override no banco. Os
 * textos usam tags `{{chave}}` / `{{chave|fallback}}` / `{{#chave}}...{{/chave}}`
 * resolvidas por `render-core`. O e-mail sempre entra na moldura visual da ACIMM
 * (o colaborador edita só assunto + corpo). NUNCA mencionar ferramentas/stack.
 *
 * Os dois templates com ramo condicional dos originais foram normalizados em
 * variantes explícitas (single-variant, uniformemente editáveis):
 *   cancelada        → cancelada_associado / cancelada_acimm
 *   contrato_enviado → contrato_enviado_autentique / contrato_enviado_email
 */

export type CanalTemplate = "whatsapp" | "email";
export type DestinoTemplate = "locatario" | "compras" | "interno";

export interface TemplatePadrao {
  /** Canais que o template usa. */
  canais: CanalTemplate[];
  /** A quem se destina (rótulo/UI). */
  destino: DestinoTemplate;
  whatsapp?: string;
  emailAssunto?: string;
  /** Corpo do e-mail em texto (parágrafos por linha em branco). */
  emailCorpo?: string;
  /** Chave do payload que vira o botão do portal no e-mail (quando não-vazia). */
  botaoLink?: string;
  botaoLabel?: string;
  /** Fluxo transacional crítico — aviso ao desativar. */
  critico?: boolean;
}

export const templatesPadrao: Record<string, TemplatePadrao> = {
  // --- Locatário ----------------------------------------------------------
  solicitacao_recebida: {
    canais: ["whatsapp", "email"],
    destino: "locatario",
    whatsapp:
      "Olá, {{nome|tudo bem}}! Recebemos sua solicitação de locação {{loc}} ({{salas|sala}} · {{data}} {{horario}}). Ela está em análise e avisaremos assim que houver retorno.{{#link}}\n\nAcompanhe pelo portal: {{link}}{{/link}}",
    emailAssunto: "Solicitação recebida — {{loc}}",
    emailCorpo:
      "Olá, {{nome|tudo bem}}!\n\nRecebemos sua solicitação {{loc}} — {{salas|sala}}, {{data}} ({{horario}}).\n\nEla está em análise. Você será avisado por e-mail e WhatsApp a cada etapa.",
    botaoLink: "link",
    botaoLabel: "Acompanhar no portal",
  },

  aprovada: {
    canais: ["whatsapp", "email"],
    destino: "locatario",
    whatsapp:
      "Boa notícia, {{nome|tudo bem}}! Sua locação {{loc}} ({{data}} {{horario}}) foi aprovada.{{#resumo}}\n\nResumo do pedido:\n{{resumo}}{{/resumo}}\n\nEm seguida enviaremos o contrato.{{#link}}\n\nAcompanhe pelo portal: {{link}}{{/link}}",
    emailAssunto: "Locação aprovada — {{loc}}",
    emailCorpo:
      "Olá, {{nome|tudo bem}}!\n\nSua locação {{loc}} ({{salas|sala}}, {{data}} · {{horario}}) foi aprovada.{{#resumo}}\n\nResumo do pedido:\n{{resumo}}{{/resumo}}\n\nO próximo passo é o contrato — você o receberá em seguida, junto das instruções de pagamento.",
    botaoLink: "link",
    botaoLabel: "Acompanhar no portal",
  },

  recusada: {
    canais: ["whatsapp", "email"],
    destino: "locatario",
    whatsapp:
      "Olá, {{nome|tudo bem}}. Sua solicitação {{loc}} ({{data}}) não pôde ser aprovada. Motivo: {{motivo|não informado}}. Para outras datas, fale com a ACIMM.",
    emailAssunto: "Sobre sua solicitação — {{loc}}",
    emailCorpo:
      "Olá, {{nome|tudo bem}}.\n\nSua solicitação {{loc}} ({{data}}) não pôde ser aprovada.\n\nMotivo: {{motivo|não informado}}.\n\nSe quiser tentar outra data, estamos à disposição.",
  },

  contrato_enviado_autentique: {
    canais: ["whatsapp", "email"],
    destino: "locatario",
    critico: true,
    whatsapp:
      "Olá, {{nome|tudo bem}}! O contrato da locação {{loc}} está pronto para assinatura: {{assinaturaLink}}",
    emailAssunto: "Contrato para assinatura — {{loc}}",
    emailCorpo:
      "Olá, {{nome|tudo bem}}!\n\nO contrato da locação {{loc}} está pronto para assinatura.",
    botaoLink: "assinaturaLink",
    botaoLabel: "Assinar contrato",
  },

  contrato_enviado_email: {
    canais: ["whatsapp"],
    destino: "locatario",
    critico: true,
    whatsapp:
      "Olá, {{nome|tudo bem}}! Enviamos o contrato da locação {{loc}} para o seu e-mail. Confira, assine e devolva à ACIMM.",
  },

  contrato_whatsapp: {
    canais: ["whatsapp"],
    destino: "locatario",
    critico: true,
    whatsapp:
      "Olá, {{nome|tudo bem}}! Segue o contrato da locação {{loc}}. Confira, assine e envie a via assinada pela plataforma.{{#link}}\n\nAcompanhe em: {{link}}{{/link}}",
  },

  instrucoes_pagamento: {
    canais: ["whatsapp", "email"],
    destino: "locatario",
    critico: true,
    whatsapp:
      "Olá, {{nome|tudo bem}}! Sua locação {{loc}} está aguardando pagamento ({{total}}). {{instrucoes}}{{#link}}\n\nEnvie o comprovante pelo portal: {{link}}{{/link}}",
    emailAssunto: "Instruções de pagamento — {{loc}}",
    emailCorpo:
      "Olá, {{nome|tudo bem}}!\n\nSua locação {{loc}} está aguardando pagamento no valor de {{total}}.\n\n{{instrucoes}}\n\nApós o pagamento, envie o comprovante pelo portal. A confirmação é feita pela ACIMM.",
    botaoLink: "link",
    botaoLabel: "Acompanhar no portal",
  },

  confirmada: {
    canais: ["whatsapp", "email"],
    destino: "locatario",
    whatsapp:
      "Tudo certo, {{nome|tudo bem}}! Sua locação {{loc}} está confirmada: {{salas|sala}} · {{data}} {{horario}}. Até lá!{{#link}}\n\nAcompanhe pelo portal: {{link}}{{/link}}",
    emailAssunto: "Locação confirmada — {{loc}}",
    emailCorpo:
      "Olá, {{nome|tudo bem}}!\n\nSua locação {{loc}} está confirmada.\n\n{{salas|Sala}} · {{data}} · {{horario}}.\n\nOs detalhes da agenda chegam por convite do Google Agenda no e-mail de cadastro.",
    botaoLink: "link",
    botaoLabel: "Acompanhar no portal",
  },

  cancelada_associado: {
    canais: ["whatsapp", "email"],
    destino: "locatario",
    whatsapp:
      "Olá, {{nome|tudo bem}}. Confirmamos o cancelamento da sua solicitação {{loc}} ({{data}}). Se precisar, é só solicitar novamente.",
    emailAssunto: "Cancelamento confirmado — {{loc}}",
    emailCorpo:
      "Olá, {{nome|tudo bem}}.\n\nConfirmamos o cancelamento da sua solicitação {{loc}} ({{data}}).\n\nQuando quiser, é só fazer uma nova solicitação.",
  },

  cancelada_acimm: {
    canais: ["whatsapp", "email"],
    destino: "locatario",
    whatsapp:
      "Olá, {{nome|tudo bem}}. Sua locação {{loc}} ({{data}}) foi cancelada. Motivo: {{motivo|não informado}}. Em caso de dúvida, fale com a ACIMM.",
    emailAssunto: "Locação cancelada — {{loc}}",
    emailCorpo:
      "Olá, {{nome|tudo bem}}.\n\nSua locação {{loc}} ({{data}}) foi cancelada.\n\nMotivo: {{motivo|não informado}}.",
  },

  lembrete_pre_evento: {
    canais: ["whatsapp", "email"],
    destino: "locatario",
    whatsapp:
      "Olá, {{nome|tudo bem}}! Lembrete: sua locação {{loc}} é {{data}} às {{horario}} ({{salas|sala}}). Até breve!{{#link}}\n\nAcompanhe pelo portal: {{link}}{{/link}}",
    emailAssunto: "Lembrete da sua locação — {{loc}}",
    emailCorpo:
      "Olá, {{nome|tudo bem}}!\n\nPassando para lembrar da sua locação {{loc}}.\n\n{{salas|Sala}} · {{data}} · {{horario}}.",
    botaoLink: "link",
    botaoLabel: "Acompanhar no portal",
  },

  // Documento (PDF de compras) — WhatsApp com mídia; o texto é a legenda.
  coffee_pdf: {
    canais: ["whatsapp"],
    destino: "compras",
    whatsapp:
      "Lista de compras do coffee break — semana {{rotulo}}. {{qtd|0}} pedido(s) firme(s). Segue o PDF.",
  },

  // --- Internas (ACIMM) — só e-mail ---------------------------------------
  interna_nova_solicitacao: {
    canais: ["email"],
    destino: "interno",
    emailAssunto: "Nova solicitação {{loc}} aguardando análise",
    emailCorpo:
      "Nova solicitação de locação {{loc}} aguardando análise.\n\nSolicitante: {{nome|—}}\n{{salas|Sala}} · {{data}} · {{horario}}\nValor: {{total}}",
    botaoLink: "linkAdmin",
    botaoLabel: "Abrir no painel",
  },

  interna_comprovante_recebido: {
    canais: ["email", "whatsapp"],
    destino: "interno",
    whatsapp:
      "Comprovante de pagamento recebido na locação {{loc}} ({{nome|—}}). Confira no painel: {{linkAdmin}}",
    emailAssunto: "Comprovante recebido — {{loc}}",
    emailCorpo:
      "Comprovante de pagamento recebido na locação {{loc}}.\n\nLocatário: {{nome|—}}.",
    botaoLink: "linkAdmin",
    botaoLabel: "Conferir no painel",
  },

  interna_contrato_assinado: {
    canais: ["email", "whatsapp"],
    destino: "interno",
    whatsapp:
      "Via assinada do contrato recebida na locação {{loc}} ({{nome|—}}). Confira no painel: {{linkAdmin}}",
    emailAssunto: "Via assinada recebida — {{loc}}",
    emailCorpo:
      "O locatário enviou a via assinada do contrato da locação {{loc}}.\n\nLocatário: {{nome|—}}. Confira e marque como assinado.",
    botaoLink: "linkAdmin",
    botaoLabel: "Conferir no painel",
  },

  interna_vaga_liberada: {
    canais: ["email"],
    destino: "interno",
    emailAssunto: "Vaga liberada — {{sala}} em {{data}}",
    emailCorpo:
      "Um horário foi liberado em {{sala}} no dia {{data}}.\n\n{{qtd|0}} interessado(s) na fila de espera.\nPrimeiro da fila: {{primeiro|—}}.",
    botaoLink: "linkAdmin",
    botaoLabel: "Abrir a lista de espera",
  },

  interna_comissao_estornada: {
    canais: ["email"],
    destino: "interno",
    emailAssunto: "Comissão estornada após pagamento — {{loc}}",
    emailCorpo:
      "Uma locação com {{qtd|1}} comissão(ões) já paga(s) ao colaborador foi cancelada ({{loc}}).\n\nLocatário: {{nome|—}}.\nComo já haviam sido pagas, lance o ajuste de volta no seu controle.",
    botaoLink: "linkAdmin",
    botaoLabel: "Ver comissões",
  },
};

/** Chaves canônicas dos templates (ordem de exibição no editor). */
export const CHAVES_TEMPLATE = Object.keys(templatesPadrao);
