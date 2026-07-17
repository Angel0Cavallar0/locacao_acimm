/**
 * Lógica PURA de resolução de preço (Spec 04 §5) — sem I/O, determinística e
 * testável. Datas são comparadas como strings 'YYYY-MM-DD' (comparação
 * lexicográfica = cronológica). dias_semana: 0=domingo … 6=sábado.
 */

export interface CandidatoPreco {
  id: string;
  valorCentavos: number;
  diasSemana: number[];
  /** Início da vigência, inclusive. null = desde sempre. */
  vigenciaInicio: string | null;
  /** Fim da vigência, EXCLUSIVO (bound `)` do daterange). null = infinito. */
  vigenciaFim: string | null;
}

export interface ContextoData {
  /** Data do evento em 'YYYY-MM-DD' (fuso America/Sao_Paulo). */
  dataISO: string;
  /** Dia da semana 0-6 no fuso America/Sao_Paulo. */
  diaSemana: number;
}

/**
 * Escolhe o preço vigente para a data/dia informados. Retorna null quando
 * não há combinação cadastrada (período indisponível naquela condição).
 * Em caso de múltiplos elegíveis, vence o de vigência mais recente.
 */
export function selecionarPreco(
  candidatos: CandidatoPreco[],
  ctx: ContextoData,
): CandidatoPreco | null {
  const elegiveis = candidatos.filter(
    (c) =>
      c.diasSemana.includes(ctx.diaSemana) &&
      (c.vigenciaInicio === null || ctx.dataISO >= c.vigenciaInicio) &&
      (c.vigenciaFim === null || ctx.dataISO < c.vigenciaFim),
  );
  if (elegiveis.length === 0) return null;

  elegiveis.sort((a, b) =>
    (a.vigenciaInicio ?? "").localeCompare(b.vigenciaInicio ?? ""),
  );
  return elegiveis[elegiveis.length - 1];
}

/** Data local (America/Sao_Paulo) a partir de um Date UTC. */
export function dataLocalSaoPaulo(data: Date): ContextoData {
  const dataISO = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);

  const curto = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
  }).format(data);
  const mapa: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return { dataISO, diaSemana: mapa[curto] ?? 0 };
}

/**
 * Parseia um daterange do Postgres, ex.: "[2026-07-16,2026-08-01)" ou
 * "[2026-07-16,)". Postgres normaliza para bounds `[)`.
 */
export function parseDaterange(range: string): {
  inicio: string | null;
  fim: string | null;
} {
  const m = range.match(/^[[(]([^,]*),([^\])]*)[\])]$/);
  if (!m) return { inicio: null, fim: null };
  const limpar = (v: string) => {
    const s = v.trim().replace(/^"|"$/g, "");
    return s.length > 0 ? s : null;
  };
  return { inicio: limpar(m[1]), fim: limpar(m[2]) };
}
