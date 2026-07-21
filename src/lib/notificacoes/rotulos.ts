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
  contrato_enviado: "Contrato enviado",
  instrucoes_pagamento: "Instruções de pagamento",
  confirmada: "Locação confirmada",
  cancelada: "Locação cancelada",
  lembrete_pre_evento: "Lembrete pré-evento",
  coffee_pdf: "PDF semanal de coffee",
  interna_nova_solicitacao: "Interna: nova solicitação",
  interna_comprovante_recebido: "Interna: comprovante recebido",
  interna_vaga_liberada: "Interna: vaga liberada",
  interna_comissao_estornada: "Interna: comissão estornada",
};

export function rotuloTemplate(t: string): string {
  return TEMPLATE_ROTULO[t] ?? t;
}
