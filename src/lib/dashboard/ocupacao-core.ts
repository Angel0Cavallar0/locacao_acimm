/**
 * Cálculo PURO de ocupação (Spec 23 §4). Sem I/O — o servidor pré-computa os
 * slots disponíveis (salas ativas × dias do mês × 3 períodos) em ms UTC e os
 * intervalos bloqueantes por sala; aqui só contamos interseções.
 *
 * Aproximação honesta (documentada no tooltip do card): "dia inteiro" conta 3
 * (intersecta os 3 períodos) e bloqueios manuais contam como ocupação.
 */

export interface Intervalo {
  inicioMs: number;
  fimMs: number;
}

export interface SlotDisponivel extends Intervalo {
  salaId: string;
}

export interface OcupacaoContagem {
  bloqueados: number;
  total: number;
}

function intersecta(a: Intervalo, b: Intervalo): boolean {
  return a.inicioMs < b.fimMs && b.inicioMs < a.fimMs;
}

/**
 * Para cada sala, conta quantos slots disponíveis têm ao menos uma ocupação
 * bloqueante intersectando. `total` = nº de slots daquela sala no período.
 */
export function ocupacaoPorSala(
  slots: SlotDisponivel[],
  ocupacoesPorSala: Map<string, Intervalo[]>,
): Map<string, OcupacaoContagem> {
  const res = new Map<string, OcupacaoContagem>();
  for (const slot of slots) {
    const cur = res.get(slot.salaId) ?? { bloqueados: 0, total: 0 };
    cur.total += 1;
    const ocupacoes = ocupacoesPorSala.get(slot.salaId);
    if (ocupacoes?.some((o) => intersecta(slot, o))) {
      cur.bloqueados += 1;
    }
    res.set(slot.salaId, cur);
  }
  return res;
}

/** Percentual 0–100 (inteiro arredondado). total 0 → 0. */
export function percentualOcupacao(bloqueados: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((bloqueados / total) * 100);
}

/** Soma das contagens por sala → total geral. */
export function totalOcupacao(
  porSala: Map<string, OcupacaoContagem>,
): OcupacaoContagem {
  let bloqueados = 0;
  let total = 0;
  for (const c of porSala.values()) {
    bloqueados += c.bloqueados;
    total += c.total;
  }
  return { bloqueados, total };
}
