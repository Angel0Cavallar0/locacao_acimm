import assert from "node:assert/strict";
import { test } from "node:test";
import type { ConfigComissoes } from "./apuracao-core.ts";
import {
  baseLocacao,
  basesDevidas,
  competenciaDoMes,
  mesDaCompetencia,
  mesRelativo,
  proximaCompetenciaAberta,
  valorComissao,
} from "./comissoes-core.ts";

// O parse da config e a lógica de faixas/bônus vivem em apuracao-core.test.ts.

const CFG_ATIVAS: ConfigComissoes = {
  locacao: { ativo: true, faixas: [{ ateCentavos: null, percentual: 10 }] },
  coffee: { ativo: true, faixas: [{ ateCentavos: null, percentual: 5 }] },
  bonus: {
    ativo: false,
    percentual: 0,
    metaLocacaoCentavos: 0,
    metaCoffeeCentavos: 0,
  },
};

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

// --- baseLocacao (Ciclo 3: salas + adicionais - descontos) -----------------

test("base locação: salas + adicionais - descontos (Spec 33)", () => {
  assert.equal(
    baseLocacao({
      valorSalasCentavos: 50000,
      valorDescontosCentavos: 20000,
      valorAdicionaisCentavos: 4500, // Ciclo 3: DENTRO da base
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

// --- basesDevidas ----------------------------------------------------------

test("devidas: gera locação + coffee quando ambas ativas e há coffee", () => {
  const linhas = basesDevidas(CFG_ATIVAS, {
    valorSalasCentavos: 50000,
    valorDescontosCentavos: 0,
    valorAdicionaisCentavos: 0,
    valorCoffeeCentavos: 20000,
  });
  assert.equal(linhas.length, 2);
  assert.deepEqual(
    linhas.find((l) => l.origem === "locacao"),
    { origem: "locacao", baseCentavos: 50000 },
  );
  assert.deepEqual(
    linhas.find((l) => l.origem === "coffee"),
    { origem: "coffee", baseCentavos: 20000 },
  );
});

test("devidas: sem coffee não gera linha de coffee", () => {
  const linhas = basesDevidas(CFG_ATIVAS, {
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
    ...CFG_ATIVAS,
    locacao: { ...CFG_ATIVAS.locacao, ativo: false },
  };
  const linhas = basesDevidas(cfg, {
    valorSalasCentavos: 50000,
    valorDescontosCentavos: 0,
    valorAdicionaisCentavos: 0,
    valorCoffeeCentavos: 20000,
  });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].origem, "coffee");
});

test("devidas: origem sem faixas configuradas não gera", () => {
  const cfg: ConfigComissoes = {
    ...CFG_ATIVAS,
    locacao: { ativo: true, faixas: [] },
  };
  const linhas = basesDevidas(cfg, {
    valorSalasCentavos: 50000,
    valorDescontosCentavos: 0,
    valorAdicionaisCentavos: 0,
    valorCoffeeCentavos: 0,
  });
  assert.equal(linhas.length, 0);
});

test("devidas: base zero (período gratuito sem adicionais) não gera locação", () => {
  const linhas = basesDevidas(CFG_ATIVAS, {
    valorSalasCentavos: 30000,
    valorDescontosCentavos: 30000, // sala 100% gratuita
    valorAdicionaisCentavos: 0,
    valorCoffeeCentavos: 0,
  });
  assert.equal(linhas.length, 0);
});

test("devidas: base ínfima ainda gera linha (o percentual é do mês, Spec 33)", () => {
  // Antes (Spec 29) o valor arredondado a 0 suprimia a linha. Agora o percentual
  // vem da apuração do mês e pode subir, então o gate é só base > 0.
  const linhas = basesDevidas(CFG_ATIVAS, {
    valorSalasCentavos: 50,
    valorDescontosCentavos: 0,
    valorAdicionaisCentavos: 0,
    valorCoffeeCentavos: 0,
  });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].baseCentavos, 50);
});

test("devidas: adicionais ENTRAM na base (Ciclo 3 / Spec 33)", () => {
  const linhas = basesDevidas(CFG_ATIVAS, {
    valorSalasCentavos: 40000,
    valorDescontosCentavos: 0,
    valorAdicionaisCentavos: 100000,
    valorCoffeeCentavos: 0,
  });
  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].origem, "locacao");
  assert.equal(linhas[0].baseCentavos, 140000);
});

// --- helpers de mês / competência ------------------------------------------

test("mesRelativo: desloca meses cruzando o ano", () => {
  assert.equal(mesRelativo("2026-01", -1), "2025-12");
  assert.equal(mesRelativo("2026-12", 1), "2027-01");
  assert.equal(mesRelativo("2026-08", 2), "2026-10");
  assert.equal(mesRelativo("2026-08", 0), "2026-08");
});

test("competenciaDoMes / mesDaCompetencia", () => {
  assert.equal(competenciaDoMes("2026-08"), "2026-08-01");
  assert.equal(mesDaCompetencia("2026-08-01"), "2026-08");
});

test("proximaCompetenciaAberta: devolve a desejada quando aberta", () => {
  assert.equal(proximaCompetenciaAberta("2026-08-01", []), "2026-08-01");
  assert.equal(
    proximaCompetenciaAberta("2026-08-01", ["2026-07-01"]),
    "2026-08-01",
  );
});

test("proximaCompetenciaAberta: pula meses fechados em sequência", () => {
  assert.equal(
    proximaCompetenciaAberta("2026-08-01", ["2026-08-01"]),
    "2026-09-01",
  );
  assert.equal(
    proximaCompetenciaAberta("2026-11-01", [
      "2026-11-01",
      "2026-12-01",
      "2027-01-01",
    ]),
    "2027-02-01",
  );
});

test("proximaCompetenciaAberta: teto de 12 meses evita laço infinito", () => {
  const todas = Array.from({ length: 24 }, (_, i) =>
    competenciaDoMes(mesRelativo("2026-01", i)),
  );
  const r = proximaCompetenciaAberta("2026-01-01", todas);
  assert.equal(r, "2027-01-01"); // parou no teto
});
