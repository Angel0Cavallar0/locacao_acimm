/**
 * Conversão de instantes UTC → America/Sao_Paulo na borda (CLAUDE.md §2).
 * O banco guarda tudo em timestamptz UTC; aqui produzimos as strings que a UI
 * exibe. Funções puras e determinísticas (o Brasil não tem mais horário de
 * verão, então o offset de São Paulo é fixo em -03:00).
 */

function partesSP(isoUtc: string) {
  const d = new Date(isoUtc);
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === t)?.value ?? "00";
  let hora = get("hour");
  if (hora === "24") hora = "00"; // Intl às vezes devolve 24 na meia-noite
  return {
    ano: get("year"),
    mes: get("month"),
    dia: get("day"),
    hora,
    minuto: get("minute"),
    segundo: get("second"),
  };
}

/**
 * Instante UTC → hora de parede em São Paulo como string "naive" sem offset
 * ('YYYY-MM-DDTHH:mm:ss'). É o formato que o FullCalendar (timeZone:'UTC')
 * mostra verbatim, garantindo horário de SP independente do fuso do navegador.
 */
export function utcParaNaiveSP(isoUtc: string): string {
  const p = partesSP(isoUtc);
  return `${p.ano}-${p.mes}-${p.dia}T${p.hora}:${p.minuto}:${p.segundo}`;
}

/** Hora "HH:mm" em São Paulo. */
export function horaSP(isoUtc: string): string {
  const p = partesSP(isoUtc);
  return `${p.hora}:${p.minuto}`;
}

/** Data "dd/MM/yyyy" em São Paulo. */
export function dataSP(isoUtc: string): string {
  const p = partesSP(isoUtc);
  return `${p.dia}/${p.mes}/${p.ano}`;
}

/**
 * Hora de parede em São Paulo ('YYYY-MM-DD' + 'HH:mm') → instante UTC ISO.
 * SP é fixo em -03:00 (sem horário de verão desde 2019), então basta ancorar
 * o offset e deixar o Date normalizar para UTC.
 */
export function spWallParaUtc(data: string, hora: string): string {
  return new Date(`${data}T${hora}:00-03:00`).toISOString();
}

/** Incrementa uma data 'YYYY-MM-DD' em um dia (para o fim exclusivo de dia inteiro). */
export function proximoDiaISO(data: string): string {
  const [ano, mes, dia] = data.split("-").map(Number);
  return new Date(Date.UTC(ano, mes - 1, dia + 1)).toISOString().slice(0, 10);
}

/** Rótulo compacto de período: "dd/MM · HH:mm–HH:mm". */
export function intervaloSP(inicioUtc: string, fimUtc: string): string {
  const i = partesSP(inicioUtc);
  const f = partesSP(fimUtc);
  const dataFim =
    i.ano === f.ano && i.mes === f.mes && i.dia === f.dia
      ? ""
      : ` (${f.dia}/${f.mes})`;
  return `${i.dia}/${i.mes} · ${i.hora}:${i.minuto}–${f.hora}:${f.minuto}${dataFim}`;
}
