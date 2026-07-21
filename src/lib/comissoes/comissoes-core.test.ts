import assert from "node:assert/strict";
import { test } from "node:test";
import {
  baseLocacao,
  comissoesDevidas,
  type ConfigComissoes,
  parsearConfigComissoes,
  valorComissao,
} from "./comissoes-core.ts";

// --- parsearConfigComissoes ------------------------------------------------

test("parse: defaults quando vazio/nulo", () => {
  assert.deepEqual(parsearConfigComissoes(null), {
    locacao: { ativo: false, percentual: 0 },
    coffee: { ativo: false, percentual: 0 },
  });
  assert.deepEqual(parsearConfigComissoes({}), {
    locacao: { ativo: false, percentual: 0 },
    coffee: { ativo: false, percentual: 0 },
  });
});

test("parse: lê ativo/percentual e limita 0..100", () => {
  const cfg = parsearConfigComissoes({
    locacao: { ativo: true, percentual: 5 },
    coffee: { ativo: true, percentual: 150 },
  });
  assert.deepEqual(cfg.locacao, { ativo: true, percentual: 5 });
  assert.equal(cfg.coffee.percentual, 100); // teto
});

test("parse: percentual negativo e não-numérico viram 0", () => {
  const cfg = parsearConfigComissoes({
    locacao: { ativo: true, percentual: -3 },
    coffee: { ativo: true, percentual: "abc" },
  });
  assert.equal(cfg.locacao.percentual, 0);
  assert.equal(cfg.coffee.percentual, 0);
});

// --- valorComissao (floor no centavo) --------------------------------------

test("valor: floor no centavo", () => {
  // 12345 * 5% = 617.25 → 617
  assert.equal(valorComissao(12345, 5), 617);
  // 199 * 10% = 19.9 → 19
  assert.equal(valorComissao(199, 10), 19);
});

test("valor: base ou percentual não-positivos → 0", () => {
  assert.equal(valorComissao(0, 10), 0);
  assert.equal(valorComissao(1000, 0), 0);
  assert.equal(valorComissao(-100, 10), 0);
});

test("valor: percentual decimal", () => {
  // 100000 * 2.5% = 2500
  assert.equal(valorComissao(100000, 2.5), 2500);
});

// --- baseLocacao (líquida de descontos + adicionais) -----------------------

test("base locação: salas - descontos + adicionais", () => {
  assert.equal(
    baseLocacao({
      valorSalasCentavos: 50000,
      valorDescontosCentavos: 20000,
      valorAdicionaisCentavos: 4500,
      valorCoffeeCentavos: 0,
    }),
    34500,
  );
});

test("base locação: nunca negativa (desconto total ≥ salas)", () => {
  assert.equal(
    baseLocacao({
      valorSalasCentavos: 30000,
      valorDescontosCentavos: 30000,
      valorAdicionaisCentavos: 0,
      valorCoffeeCentavos: 0,
    }),
    0,
  );
});

// --- comissoesDevidas ------------------------------------------------------

const CFG_ATIVAS: ConfigComissoes = {
  locacao: { ativo: true, percentual: 10 },
  coffee: { ativo: true, percentual: 5 },
};

test("devidas: gera locação + coffee quando ambas ativas e há coffee", () => {
  const linhas = comissoesDevidas(CFG_ATIVAS, {
    valorSalasCentavos: 50000,
    valorDescontosCentavos: 0,
    valorAdicionaisCentavos: 0,
    valorCoffeeCentavos: 20000,
  });
  assert.equal(linhas.length, 2);
  const loc = linhas.find((l) => l.origem === "locacao");
  const cof = linhas.find((l) => l.origem === "coffee");
  assert.deepEqual(loc, {
    origem: "locacao",
    baseCentavos: 50000,
    percentual: 10,
    valorCentavos: 5000,
  });
  assert.deepEqual(cof, {
    origem: "coffee",
    baseCentavos: 20000,
    percentual: 5,
    valorCentavos: 1000,
  });
});

test("devidas: sem coffee não gera linha de coffee", () => {
  const linhas = comissoesDevidas(CFG_ATIVAS, {
    valorSalasCentavos: 50000,
    valorDescontosCentavos: 0,
    valorAdicionaisCentavos: 0,
    valorCoffeeCentavos: 0,
  });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].origem, "locacao");
});

test("devidas: origem inativa não gera", () => {
  const cfg: ConfigComissoes = {
    locacao: { ativo: false, percentual: 10 },
    coffee: { ativo: true, percentual: 5 },
  };
  const linhas = comissoesDevidas(cfg, {
    valorSalasCentavos: 50000,
    valorDescontosCentavos: 0,
    valorAdicionaisCentavos: 0,
    valorCoffeeCentavos: 20000,
  });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].origem, "coffee");
});

test("devidas: base zero (período gratuito sem adicionais) não gera locação", () => {
  const linhas = comissoesDevidas(CFG_ATIVAS, {
    valorSalasCentavos: 30000,
    valorDescontosCentavos: 30000, // sala 100% gratuita
    valorAdicionaisCentavos: 0,
    valorCoffeeCentavos: 0,
  });
  assert.equal(linhas.length, 0);
});

test("devidas: valor arredondado a 0 não gera linha", () => {
  const cfg: ConfigComissoes = {
    locacao: { ativo: true, percentual: 1 },
    coffee: { ativo: false, percentual: 0 },
  };
  // base 50 * 1% = 0.5 → floor 0 → sem linha
  const linhas = comissoesDevidas(cfg, {
    valorSalasCentavos: 50,
    valorDescontosCentavos: 0,
    valorAdicionaisCentavos: 0,
    valorCoffeeCentavos: 0,
  });
  assert.equal(linhas.length, 0);
});
