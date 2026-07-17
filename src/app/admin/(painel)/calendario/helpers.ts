import type { AgendaItem } from "@/lib/calendario/tipos";

/** Categorias de filtro de status (§4). */
export type CategoriaStatus =
  | "pendentes"
  | "confirmadas"
  | "eventos"
  | "bloqueios";

export const CATEGORIAS_STATUS: { valor: CategoriaStatus; rotulo: string }[] = [
  { valor: "pendentes", rotulo: "Pendentes" },
  { valor: "confirmadas", rotulo: "Confirmadas" },
  { valor: "eventos", rotulo: "Eventos" },
  { valor: "bloqueios", rotulo: "Bloqueios" },
];

/** Uma solicitação de locação ainda não aprovada (não-bloqueante). */
export function ehPendente(item: AgendaItem): boolean {
  return item.origem === "locacao" && !item.bloqueante;
}

/** Categoria de status de um item, para o filtro. */
export function categoriaDoItem(item: AgendaItem): CategoriaStatus {
  if (item.origem === "evento_interno") return "eventos";
  if (item.origem === "bloqueio") return "bloqueios";
  return item.bloqueante ? "confirmadas" : "pendentes";
}

/** Texto curto do evento no grid (após "{Sala} · "). */
export function conteudoCurto(item: AgendaItem): string {
  if (item.origem === "locacao") {
    return item.locatario ?? `LOC-${String(item.locacaoNumero ?? 0).padStart(6, "0")}`;
  }
  if (item.origem === "evento_interno") {
    return item.eventoTitulo ?? "Evento ACIMM";
  }
  return item.motivo ?? "Bloqueio";
}
