import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type CandidatoPreco,
  parseDaterange,
  selecionarPreco,
} from "./resolver-core.ts";

const base = (over: Partial<CandidatoPreco>): CandidatoPreco => ({
  id: "x",
  valorCentavos: 0,
  diasSemana: [0, 1, 2, 3, 4, 5, 6],
  vigenciaInicio: null,
  vigenciaFim: null,
  ...over,
});

test("vigência trocando no dia do reajuste", () => {
  const antigo = base({
    id: "antigo",
    valorCentavos: 10000,
    vigenciaInicio: null,
    vigenciaFim: "2026-07-16", // exclusivo
  });
  const novo = base({
    id: "novo",
    valorCentavos: 12000,
    vigenciaInicio: "2026-07-16",
    vigenciaFim: null,
  });
  const candidatos = [antigo, novo];

  // Véspera do reajuste → preço antigo.
  assert.equal(
    selecionarPreco(candidatos, { dataISO: "2026-07-15", diaSemana: 3 })?.id,
    "antigo",
  );
  // No próprio dia do reajuste (início inclusivo, fim exclusivo) → preço novo.
  assert.equal(
    selecionarPreco(candidatos, { dataISO: "2026-07-16", diaSemana: 4 })?.id,
    "novo",
  );
});

test("dia da semana na borda", () => {
  // Preço só para segunda-feira (1).
  const soSegunda = base({ id: "seg", diasSemana: [1], valorCentavos: 5000 });

  // Segunda → casa.
  assert.equal(
    selecionarPreco([soSegunda], { dataISO: "2026-07-13", diaSemana: 1 })?.id,
    "seg",
  );
  // Terça → não casa (sem preço).
  assert.equal(
    selecionarPreco([soSegunda], { dataISO: "2026-07-14", diaSemana: 2 }),
    null,
  );
});

test("combinação ausente retorna null", () => {
  assert.equal(
    selecionarPreco([], { dataISO: "2026-07-16", diaSemana: 4 }),
    null,
  );
});

test("parseDaterange lida com fim aberto e fechado", () => {
  assert.deepEqual(parseDaterange("[2026-07-16,)"), {
    inicio: "2026-07-16",
    fim: null,
  });
  assert.deepEqual(parseDaterange("[2026-07-16,2026-08-01)"), {
    inicio: "2026-07-16",
    fim: "2026-08-01",
  });
});
