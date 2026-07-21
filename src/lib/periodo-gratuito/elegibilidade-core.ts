/**
 * Elegibilidade do período gratuito do sócio — decisão PURA (Spec 20 §5.2).
 * Sem I/O: os dados (regra da sala, uso atual no ciclo, situação do associado)
 * são buscados no servidor e passados aqui. Testável no `node --test`.
 *
 * Todas as condições precisam valer: sócio ativo, sala única fora de combo, sala
 * com regra ativa, período dentro da regra e uso no ciclo abaixo do limite.
 */

export type MotivoInelegivel =
  | "nao_associado"
  | "com_combo"
  | "multi_sala"
  | "sem_regra"
  | "periodo_fora"
  | "esgotado";

export interface RegraGratuito {
  periodos: string[];
  usosPorCiclo: number;
  ativo: boolean;
}

export interface EntradaElegibilidade {
  condicao: string; // 'associado' | 'nao_associado'
  associadoAtivo: boolean;
  salaCount: number;
  temCombo: boolean;
  periodo: string;
  regra: RegraGratuito | null;
  usoAtual: number;
}

export interface ResultadoElegibilidade {
  elegivel: boolean;
  motivo?: MotivoInelegivel;
  usoAtual: number;
  limite: number;
}

export function avaliarPeriodoGratuito(
  e: EntradaElegibilidade,
): ResultadoElegibilidade {
  const limite = e.regra?.usosPorCiclo ?? 0;
  const base = { usoAtual: e.usoAtual, limite };

  if (e.condicao !== "associado" || !e.associadoAtivo) {
    return { elegivel: false, motivo: "nao_associado", ...base };
  }
  if (e.temCombo) {
    return { elegivel: false, motivo: "com_combo", ...base };
  }
  if (e.salaCount !== 1) {
    return { elegivel: false, motivo: "multi_sala", ...base };
  }
  if (!e.regra || !e.regra.ativo) {
    return { elegivel: false, motivo: "sem_regra", ...base };
  }
  if (!e.regra.periodos.includes(e.periodo)) {
    return { elegivel: false, motivo: "periodo_fora", ...base };
  }
  if (e.usoAtual >= e.regra.usosPorCiclo) {
    return { elegivel: false, motivo: "esgotado", ...base };
  }
  return { elegivel: true, ...base };
}

/** Ciclo (mês civil da data do evento) como 'YYYY-MM-01'. */
export function cicloDeData(dataISO: string): string {
  return `${dataISO.slice(0, 7)}-01`;
}
