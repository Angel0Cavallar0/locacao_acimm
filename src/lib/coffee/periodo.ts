import { proximoDiaISO, spWallParaUtc } from "@/lib/calendario/tempo";

/**
 * Períodos de consulta dos pedidos de coffee (Spec 08 §3). As datas de borda
 * são "wall time" de São Paulo ('YYYY-MM-DD'); os instantes UTC são derivados
 * na borda. Funções de data são puras (aritmética em UTC sobre a data nua).
 */

export interface IntervaloCoffee {
  /** Primeiro dia do intervalo (SP, inclusive). */
  inicioData: string;
  /** Último dia do intervalo (SP, inclusive). */
  fimData: string;
  /** Instante UTC do início (00:00 SP do primeiro dia). */
  inicioUtc: string;
  /** Instante UTC do fim, EXCLUSIVO (00:00 SP do dia seguinte ao último). */
  fimUtc: string;
  /** Rótulo humano "dd/MM/aaaa a dd/MM/aaaa". */
  rotulo: string;
}

/** Data 'YYYY-MM-DD' de hoje em São Paulo (única função não determinística). */
export function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

/** Soma `n` dias a uma data 'YYYY-MM-DD' (n pode ser negativo). Pura. */
export function adicionarDiasISO(data: string, n: number): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + n)).toISOString().slice(0, 10);
}

/** Segunda-feira (SP) da semana que contém `data`. Pura. */
export function segundaDaSemana(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  const diaSemana = new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay(); // 0=dom
  const recuo = (diaSemana + 6) % 7; // segunda = 0
  return adicionarDiasISO(data, -recuo);
}

function formatarDataBR(data: string): string {
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** Intervalo entre duas datas 'YYYY-MM-DD' (inclusivas). Pura. */
export function intervaloDeDatas(
  inicioData: string,
  fimData: string,
): IntervaloCoffee {
  return {
    inicioData,
    fimData,
    inicioUtc: spWallParaUtc(inicioData, "00:00"),
    fimUtc: spWallParaUtc(proximoDiaISO(fimData), "00:00"),
    rotulo: `${formatarDataBR(inicioData)} a ${formatarDataBR(fimData)}`,
  };
}

/** Semana seg–dom que contém `data` (default: hoje em SP). */
export function intervaloSemana(data: string): IntervaloCoffee {
  const seg = segundaDaSemana(data);
  return intervaloDeDatas(seg, adicionarDiasISO(seg, 6));
}

/** Semana deslocada `n` semanas a partir da que contém `data`. */
export function semanaDeslocada(data: string, n: number): IntervaloCoffee {
  return intervaloSemana(adicionarDiasISO(segundaDaSemana(data), n * 7));
}
