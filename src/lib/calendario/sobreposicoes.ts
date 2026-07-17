/**
 * Detecção PURA de sobreposições da agenda (Spec 05 §5, regra CLAUDE.md §8.3).
 *
 * Só interessam conflitos que envolvem uma PENDÊNCIA (solicitação de locação
 * ainda não aprovada = não-bloqueante). Dois pares são flagrados:
 *   - pendente × pendente
 *   - pendente × bloqueante (locação confirmada, evento ACIMM ou bloqueio)
 * bloqueante × bloqueante é impossível na mesma sala (constraint de exclusão),
 * então nunca gera falso positivo.
 */

import type {
  AgendaItem,
  EnvolvidoSobreposicao,
  Sobreposicao,
} from "./tipos";

/** Uma pendência = locação ainda sem efeito bloqueante (aguardando aprovação). */
function ehPendente(it: AgendaItem): boolean {
  return it.origem === "locacao" && !it.bloqueante;
}

function envolvido(it: AgendaItem): EnvolvidoSobreposicao {
  let rotulo: string;
  if (it.origem === "locacao") {
    const loc = `LOC-${String(it.locacaoNumero ?? 0).padStart(6, "0")}`;
    rotulo = `${loc} · ${it.locatario ?? "Locatário"}`;
  } else if (it.origem === "evento_interno") {
    rotulo = `Evento: ${it.eventoTitulo ?? "ACIMM"}`;
  } else {
    rotulo = `Bloqueio: ${it.motivo ?? "sem motivo"}`;
  }
  return {
    agendaId: it.id,
    rotulo,
    locacaoId: it.locacaoId ?? null,
    pendente: ehPendente(it),
  };
}

function seSobrepoem(a: AgendaItem, b: AgendaItem): boolean {
  const aI = Date.parse(a.inicioUtc);
  const aF = Date.parse(a.fimUtc);
  const bI = Date.parse(b.inicioUtc);
  const bF = Date.parse(b.fimUtc);
  return aI < bF && bI < aF; // intervalos [inicio, fim)
}

export function detectarSobreposicoes(itens: AgendaItem[]): Sobreposicao[] {
  const porSala = new Map<string, AgendaItem[]>();
  for (const it of itens) {
    const arr = porSala.get(it.salaId);
    if (arr) arr.push(it);
    else porSala.set(it.salaId, [it]);
  }

  const resultado: Sobreposicao[] = [];
  for (const arr of porSala.values()) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const a = arr[i];
        const b = arr[j];
        if (!ehPendente(a) && !ehPendente(b)) continue; // precisa envolver pendência
        if (!seSobrepoem(a, b)) continue;
        const inicio = Math.max(Date.parse(a.inicioUtc), Date.parse(b.inicioUtc));
        const fim = Math.min(Date.parse(a.fimUtc), Date.parse(b.fimUtc));
        resultado.push({
          salaNome: a.salaNome,
          inicioUtc: new Date(inicio).toISOString(),
          fimUtc: new Date(fim).toISOString(),
          envolvidos: [envolvido(a), envolvido(b)],
        });
      }
    }
  }
  return resultado;
}

/** Conjunto de ids de agenda envolvidos em alguma sobreposição (realce no grid). */
export function idsEmConflito(sobreposicoes: Sobreposicao[]): Set<string> {
  const s = new Set<string>();
  for (const so of sobreposicoes) {
    for (const e of so.envolvidos) s.add(e.agendaId);
  }
  return s;
}
