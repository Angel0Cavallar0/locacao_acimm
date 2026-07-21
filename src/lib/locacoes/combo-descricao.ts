import type { ComboAplicavel } from "./combos-dados";
import { centavosParaBRL } from "@/lib/utils/moeda";

/** Descrição curta de um combo para cards de seleção (client-safe, sem I/O). */
export function descreverCombo(c: ComboAplicavel): string {
  if (c.tipo === "evento_privativo") {
    return `Privativo — todas as salas por ${centavosParaBRL(c.valorCentavos ?? 0)}`;
  }
  const desc =
    c.tipoDesconto === "percentual"
      ? `${c.descontoValor ?? 0}% de desconto`
      : `${centavosParaBRL(c.descontoValor ?? 0)} de desconto`;
  return `Multi-sala — ${desc}`;
}
