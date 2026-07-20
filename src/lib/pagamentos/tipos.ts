import type { StatusPagamento } from "./pagamentos-core";

/** Rótulos e cores de status de pagamento (Spec 14), server + client. */

export const STATUS_PAGAMENTO_ROTULO: Record<StatusPagamento, string> = {
  pendente: "Pendente",
  pago: "Pago",
  isento: "Isento",
  estornado: "Estornado",
};

/** Classe do badge por status (tokens do tema). */
export const STATUS_PAGAMENTO_BADGE: Record<StatusPagamento, string> = {
  pendente: "bg-surface-muted text-ink-muted",
  pago: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  isento: "bg-brand/10 text-brand",
  estornado: "bg-destructive/10 text-destructive line-through",
};
