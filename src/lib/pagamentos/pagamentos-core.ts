/**
 * Regras PURAS de pagamento (Spec 14). Sem I/O — testáveis isoladamente e
 * reusáveis no servidor. Formas/valores em centavos; o total é sempre a
 * autoridade (recomposição híbrida deve fechar ao centavo).
 */

export type StatusPagamento = "pendente" | "pago" | "isento" | "estornado";
export type FormaPagamento =
  | "pix"
  | "transferencia"
  | "cartao"
  | "dinheiro"
  | "boleto_avulso"
  | "boleto_mensalidade"
  | "isento";

/** Status que contam como quitados (não esperam baixa). */
export function pagamentoQuitado(status: StatusPagamento): boolean {
  return status === "pago" || status === "isento";
}

/**
 * A locação está totalmente quitada quando há ao menos um pagamento e todos os
 * NÃO estornados estão quitados. Registros `estornado` são histórico: foram
 * substituídos por um novo pendente equivalente, então não travam a quitação.
 */
export function locacaoQuitada(status: StatusPagamento[]): boolean {
  const vigentes = status.filter((s) => s !== "estornado");
  if (vigentes.length === 0) return false;
  return vigentes.every(pagamentoQuitado);
}

/** Isenção total: forma isento OU total zero (§3). */
export function ehIsencao(
  forma: FormaPagamento | null,
  valorTotalCentavos: number,
): boolean {
  return forma === "isento" || valorTotalCentavos === 0;
}

/**
 * A estrutura só pode ser recomposta enquanto TODOS os registros vigentes
 * estiverem pendentes (nenhuma baixa/isenção ainda). Após a primeira baixa,
 * congela — só o estorno reabre (§4).
 */
export function podeRecompor(status: StatusPagamento[]): boolean {
  return status.every((s) => s === "pendente");
}

/** A soma dos itens da recomposição deve bater exatamente com o total (§4). */
export function somaConfere(
  itensCentavos: number[],
  valorTotalCentavos: number,
): boolean {
  const soma = itensCentavos.reduce((s, v) => s + v, 0);
  return soma === valorTotalCentavos;
}

/**
 * Na recomposição, cada item nasce quitado (`isento`) ou pendente conforme a
 * forma escolhida — isento é uma renúncia consciente do colaborador (§4).
 */
export function statusInicialItem(forma: FormaPagamento): StatusPagamento {
  return forma === "isento" ? "isento" : "pendente";
}
