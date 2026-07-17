/**
 * Aritmética PURA do cálculo de valores (Spec 07 §4). Sem I/O — os preços de
 * sala (resolverPreco) e o valor por pessoa do coffee (coffee_niveis) são
 * buscados no banco em `calcular.ts`; aqui só somamos componentes já resolvidos.
 * Valores em centavos.
 */

export function somarAdicionais(
  itens: { quantidade: number; valorUnitarioCentavos: number }[],
): number {
  return itens.reduce(
    (s, a) =>
      s + Math.round(Math.max(0, a.quantidade) * Math.max(0, a.valorUnitarioCentavos)),
    0,
  );
}

export function totalCoffee(
  valorPessoaCentavos: number,
  qtdPessoas: number,
  adicionaisCentavos: number,
): number {
  return (
    Math.max(0, valorPessoaCentavos) * Math.max(0, qtdPessoas) +
    Math.max(0, adicionaisCentavos)
  );
}

export function totalGeral(p: {
  salasCentavos: number;
  coffeeCentavos: number;
  adicionaisCentavos: number;
  descontosCentavos: number;
}): number {
  return (
    p.salasCentavos + p.coffeeCentavos + p.adicionaisCentavos - p.descontosCentavos
  );
}
