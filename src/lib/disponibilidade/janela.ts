/** Janela de consulta da disponibilidade (Spec 10 §2/§7): hoje → +180 dias. */

export const DIAS_JANELA = 180;

/** Data 'YYYY-MM-DD' de hoje em São Paulo. */
export function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

/** Soma `n` dias a uma data 'YYYY-MM-DD'. Pura. */
export function somarDias(data: string, n: number): string {
  const [y, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Última data selecionável (hoje + 180). */
export function dataMaximaSP(): string {
  return somarDias(hojeSP(), DIAS_JANELA);
}

/** A data está no intervalo permitido (hoje → +180d)? */
export function dentroDaJanela(data: string): boolean {
  return data >= hojeSP() && data <= dataMaximaSP();
}

/**
 * A data respeita a antecedência mínima de `diasMin` dias (Melhorias §A)?
 * `diasMin = 0` → sempre respeita (sem restrição). Comparação em datas 'YYYY-MM-DD'
 * de São Paulo — `hoje` opcional para testes determinísticos.
 */
export function respeitaAntecedencia(
  data: string,
  diasMin: number,
  hoje: string = hojeSP(),
): boolean {
  if (!Number.isFinite(diasMin) || diasMin <= 0) return true;
  return data >= somarDias(hoje, diasMin);
}
