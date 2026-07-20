import type { ChipPeriodo } from "./tipos";

/**
 * Agregação do estado de um período entre VÁRIAS salas (Spec 11 §4 etapa 1):
 * só é "livre" quando TODAS as salas estão livres e com preço; caso contrário
 * o pior estado prevalece para orientar a saída (evento > ocupado > solicitado).
 * Pura e testada — o formulário só exibe.
 */

export type EstadoAgregado = ChipPeriodo["estado"];

export interface Agregado {
  estado: EstadoAgregado;
  /** Soma dos preços quando todas livres com preço; senão null. */
  precoTotal: number | null;
}

export function agregarChips(chips: (ChipPeriodo | undefined)[]): Agregado {
  const cs = chips.filter((c): c is ChipPeriodo => Boolean(c));
  if (cs.length === 0) return { estado: "sem_preco", precoTotal: null };

  const estados = cs.map((c) => c.estado);
  if (estados.every((e) => e === "livre")) {
    if (cs.some((c) => c.precoCentavos === null)) {
      return { estado: "sem_preco", precoTotal: null };
    }
    return {
      estado: "livre",
      precoTotal: cs.reduce((a, c) => a + (c.precoCentavos ?? 0), 0),
    };
  }
  if (estados.includes("ocupado")) return { estado: "ocupado", precoTotal: null };
  if (estados.includes("evento_acimm")) {
    return { estado: "evento_acimm", precoTotal: null };
  }
  if (estados.includes("solicitado")) {
    return { estado: "solicitado", precoTotal: null };
  }
  return { estado: "sem_preco", precoTotal: null };
}
