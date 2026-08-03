/** Rótulos pt-BR de notificações para a UI do admin (Spec 15 §6). Puro. */

export const CANAL_ROTULO: Record<string, string> = {
  whatsapp: "WhatsApp",
  email: "E-mail",
};

export const STATUS_NOTIFICACAO_ROTULO: Record<string, string> = {
  pendente: "Pendente",
  enviada: "Enviada",
  falha: "Falha",
};

export const STATUS_NOTIFICACAO_BADGE: Record<string, string> = {
  pendente: "bg-surface-muted text-ink-muted",
  enviada: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  falha: "bg-destructive/10 text-destructive",
};

export const TEMPLATE_ROTULO: Record<string, string> = {
  solicitacao_recebida: "Solicitação recebida",
  aprovada: "Locação aprovada",
  recusada: "Solicitação recusada",
  contrato_enviado_autentique: "Contrato enviado (assinatura online)",
  contrato_enviado_email: "Contrato enviado (por e-mail)",
  contrato_whatsapp: "Contrato enviado (WhatsApp)",
  interna_contrato_assinado: "Via assinada recebida (interno)",
  instrucoes_pagamento: "Instruções de pagamento",
  confirmada: "Locação confirmada",
  cancelada_associado: "Cancelamento pelo associado",
  cancelada_acimm: "Cancelamento pela ACIMM",
  lembrete_pre_evento: "Lembrete pré-evento",
  coffee_pdf: "PDF semanal de coffee",
  interna_nova_solicitacao: "Interna: nova solicitação",
  interna_comprovante_recebido: "Interna: comprovante recebido",
  interna_vaga_liberada: "Interna: vaga liberada",
  interna_comissao_estornada: "Interna: comissão estornada",
  // Ids antigos (compat. de exibição para linhas históricas).
  contrato_enviado: "Contrato enviado",
  cancelada: "Locação cancelada",
};

export function rotuloTemplate(t: string): string {
  return TEMPLATE_ROTULO[t] ?? t;
}
