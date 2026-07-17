import type { FaixaPreco } from "./tipos";

/**
 * Lógica PURA das faixas de preço do coffee (Spec 08, revisão). Cada faixa
 * define o valor POR PESSOA para um intervalo de nº de pessoas; o total é
 * `valorPessoa × pessoas + adicionais` (calculado no servidor). Testado.
 */

/** Faixas a partir do JSONB do banco (aceita snake_case ou camelCase). */
export function parsearFaixas(raw: unknown): FaixaPreco[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      const min = Math.trunc(Number(o.min_pessoas ?? o.minPessoas ?? 1)) || 1;
      const maxRaw = o.max_pessoas ?? o.maxPessoas;
      const max =
        maxRaw === null || maxRaw === undefined || maxRaw === ""
          ? null
          : Math.trunc(Number(maxRaw));
      const valor =
        Math.trunc(Number(o.valor_pessoa_centavos ?? o.valorPessoaCentavos ?? 0)) ||
        0;
      return {
        minPessoas: Math.max(1, min),
        maxPessoas: max !== null && Number.isFinite(max) ? max : null,
        valorPessoaCentavos: Math.max(0, valor),
      };
    })
    .filter((f) => f.maxPessoas === null || f.maxPessoas >= f.minPessoas);
}

/**
 * Faixa aplicável a `qtd` pessoas. Regra:
 *  1. match exato de intervalo (min ≤ qtd ≤ max; max nulo = aberto). Em
 *     sobreposição, vence a de maior `minPessoas`.
 *  2. abaixo de todas as faixas → usa a de menor `minPessoas` (não zera).
 *  3. em lacuna/acima → a maior faixa cujo `minPessoas ≤ qtd`.
 * Sem faixas → null.
 */
export function faixaDe(faixas: FaixaPreco[], qtd: number): FaixaPreco | null {
  if (faixas.length === 0) return null;
  const ordenadas = [...faixas].sort((a, b) => a.minPessoas - b.minPessoas);

  const exatas = ordenadas.filter(
    (f) => qtd >= f.minPessoas && (f.maxPessoas === null || qtd <= f.maxPessoas),
  );
  if (exatas.length > 0) return exatas[exatas.length - 1];

  if (qtd < ordenadas[0].minPessoas) return ordenadas[0];

  const abaixo = ordenadas.filter((f) => f.minPessoas <= qtd);
  return abaixo[abaixo.length - 1] ?? ordenadas[ordenadas.length - 1];
}

/** Valor por pessoa (centavos) aplicável a `qtd`. 0 se não houver faixas. */
export function valorPessoaDe(faixas: FaixaPreco[], qtd: number): number {
  return faixaDe(faixas, qtd)?.valorPessoaCentavos ?? 0;
}

/** Rótulo curto de uma faixa: "8 a 14" ou "15+". */
export function rotuloFaixa(f: FaixaPreco): string {
  return f.maxPessoas === null
    ? `${f.minPessoas}+`
    : `${f.minPessoas} a ${f.maxPessoas}`;
}
