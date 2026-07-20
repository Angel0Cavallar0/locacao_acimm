import assert from "node:assert/strict";
import { test } from "node:test";
import {
  faixaDe,
  parsearFaixas,
  rotuloFaixa,
  valorPessoaDe,
} from "./faixas-core.ts";

const FAIXAS = [
  { minPessoas: 8, maxPessoas: 14, valorPessoaCentavos: 2500 },
  { minPessoas: 15, maxPessoas: null, valorPessoaCentavos: 2000 },
];

test("seleciona a faixa exata por intervalo", () => {
  assert.equal(valorPessoaDe(FAIXAS, 8), 2500);
  assert.equal(valorPessoaDe(FAIXAS, 14), 2500);
  assert.equal(valorPessoaDe(FAIXAS, 15), 2000);
  assert.equal(valorPessoaDe(FAIXAS, 40), 2000); // faixa aberta
});

test("abaixo de todas as faixas usa a menor faixa", () => {
  assert.equal(valorPessoaDe(FAIXAS, 3), 2500);
});

test("lacuna entre faixas cai na maior faixa cujo min <= qtd", () => {
  const comLacuna = [
    { minPessoas: 5, maxPessoas: 9, valorPessoaCentavos: 3000 },
    { minPessoas: 20, maxPessoas: null, valorPessoaCentavos: 1500 },
  ];
  // 12 pessoas: sem intervalo exato; maior min<=12 é o de min 5.
  assert.equal(valorPessoaDe(comLacuna, 12), 3000);
});

test("sem faixas devolve 0 / null", () => {
  assert.equal(valorPessoaDe([], 10), 0);
  assert.equal(faixaDe([], 10), null);
});

test("parsearFaixas aceita snake_case e trata max aberto", () => {
  const f = parsearFaixas([
    { min_pessoas: 8, max_pessoas: 14, valor_pessoa_centavos: 2500 },
    { min_pessoas: 15, max_pessoas: null, valor_pessoa_centavos: 2000 },
  ]);
  assert.deepEqual(f, FAIXAS);
});

test("parsearFaixas descarta faixa com max < min e normaliza min>=1", () => {
  const f = parsearFaixas([
    { min_pessoas: 0, max_pessoas: null, valor_pessoa_centavos: 1000 },
    { min_pessoas: 10, max_pessoas: 5, valor_pessoa_centavos: 2000 },
  ]);
  assert.equal(f.length, 1);
  assert.equal(f[0].minPessoas, 1);
});

test("rotuloFaixa formata intervalo e faixa aberta", () => {
  assert.equal(rotuloFaixa(FAIXAS[0]), "8 a 14");
  assert.equal(rotuloFaixa(FAIXAS[1]), "15+");
});
