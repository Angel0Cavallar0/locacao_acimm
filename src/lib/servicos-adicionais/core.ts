import type { ModeloCobranca } from "./tipos";

/**
 * Regras puras/testáveis do catálogo de serviços adicionais (Spec 30 §2.4).
 * O valor de um adicional NUNCA vem do client: o servidor recalcula a partir do
 * catálogo. `sob_consulta` é a única exceção — valor digitado manualmente.
 */

/** `por_unidade` é o único modelo com quantidade variável. */
export function usaQuantidade(modelo: ModeloCobranca): boolean {
  return modelo === "por_unidade";
}

/** `sob_consulta` exige um valor digitado (cotação); os demais têm preço fixo. */
export function exigeValorManual(modelo: ModeloCobranca): boolean {
  return modelo === "sob_consulta";
}

/**
 * Valor total (centavos) de um adicional do catálogo. Retorna `null` quando o
 * modelo é `sob_consulta` e o valor manual não foi informado (bloqueia o envio
 * para pagamento até a cotação). Quantidade só se aplica a `por_unidade`.
 */
export function valorAdicionalCatalogo(input: {
  modelo: ModeloCobranca;
  valorUnitarioCentavos: number | null;
  quantidade: number;
  valorManualCentavos: number | null;
}): number | null {
  const { modelo, valorUnitarioCentavos, quantidade, valorManualCentavos } =
    input;
  if (modelo === "sob_consulta") {
    if (valorManualCentavos == null || valorManualCentavos < 0) return null;
    return Math.round(valorManualCentavos);
  }
  const unit = valorUnitarioCentavos ?? 0;
  if (modelo === "por_unidade") {
    const q = Number.isFinite(quantidade) && quantidade > 0 ? quantidade : 0;
    return Math.round(unit * q);
  }
  // fixo_evento
  return Math.round(unit);
}

/** Um serviço está disponível para uma locação de salas `salaIds`? */
export function servicoDisponivelPara(
  servicoSalaId: string | null,
  salaIds: string[],
): boolean {
  if (!servicoSalaId) return true; // qualquer sala
  return salaIds.includes(servicoSalaId);
}
