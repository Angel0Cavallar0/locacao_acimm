import type { OcupacaoSlot } from "./tipos";

/**
 * Lógica PURA do estado de um período (Spec 10 §3). Sem I/O: recebe o intervalo
 * do slot e as ocupações do dia (já em ms) e devolve o estado base
 * (livre/solicitado/ocupado/evento_acimm). O "sem_preco" é decidido depois, no
 * servidor, quando o slot está livre mas não há preço vigente. Testado.
 */

export type EstadoBase = "livre" | "solicitado" | "ocupado" | "evento_acimm";

const PRIORIDADE: Record<OcupacaoSlot["situacao"], number> = {
  evento_acimm: 3,
  ocupado: 2,
  solicitado: 1,
};

export interface ResultadoEstado {
  estado: EstadoBase;
  eventoTitulo: string | null;
  eventoSymplaId: string | null;
  eventoSymplaUrl: string | null;
}

/**
 * Intervalos são semiabertos [inicio, fim): ocupação que termina exatamente no
 * início do slot NÃO conflita. Em sobreposição mista, vence o mais restritivo
 * (evento_acimm > ocupado > solicitado).
 */
export function estadoDoSlot(
  slot: { inicioMs: number; fimMs: number },
  ocupacoes: OcupacaoSlot[],
): ResultadoEstado {
  const sobrepostas = ocupacoes.filter(
    (o) => o.inicioMs < slot.fimMs && o.fimMs > slot.inicioMs,
  );
  if (sobrepostas.length === 0) {
    return {
      estado: "livre",
      eventoTitulo: null,
      eventoSymplaId: null,
      eventoSymplaUrl: null,
    };
  }
  const top = sobrepostas.reduce((a, b) =>
    PRIORIDADE[b.situacao] > PRIORIDADE[a.situacao] ? b : a,
  );
  return {
    estado: top.situacao,
    eventoTitulo: top.eventoTitulo,
    eventoSymplaId: top.eventoSymplaId,
    eventoSymplaUrl: top.eventoSymplaUrl,
  };
}
