/** Formatação/parse de valores monetários. Persistência sempre em centavos. */

export function centavosParaBRL(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

/**
 * Converte texto digitado (ex.: "1.234,56", "50", "50,90") em centavos.
 * Trata "." como separador de milhar e "," como decimal (padrão BRL).
 */
export function brlParaCentavos(texto: string): number {
  const limpo = texto
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const valor = Number.parseFloat(limpo);
  if (Number.isNaN(valor)) return 0;
  return Math.round(valor * 100);
}
