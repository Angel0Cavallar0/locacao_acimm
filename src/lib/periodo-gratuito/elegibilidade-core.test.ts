import assert from "node:assert/strict";
import { test } from "node:test";
import {
  avaliarPeriodoGratuito,
  cicloDeData,
  type EntradaElegibilidade,
} from "./elegibilidade-core.ts";

const REGRA = { periodos: ["manha", "tarde"], usosPorCiclo: 1, ativo: true };

function base(over: Partial<EntradaElegibilidade> = {}): EntradaElegibilidade {
  return {
    condicao: "associado",
    associadoAtivo: true,
    salaCount: 1,
    temCombo: false,
    periodo: "manha",
    regra: REGRA,
    usoAtual: 0,
    ...over,
  };
}

test("elegível quando tudo bate", () => {
  const r = avaliarPeriodoGratuito(base());
  assert.equal(r.elegivel, true);
  assert.equal(r.limite, 1);
  assert.equal(r.usoAtual, 0);
});

test("não-associado é inelegível", () => {
  const r = avaliarPeriodoGratuito(base({ condicao: "nao_associado" }));
  assert.equal(r.elegivel, false);
  assert.equal(r.motivo, "nao_associado");
});

test("associado não-ativo é inelegível", () => {
  const r = avaliarPeriodoGratuito(base({ associadoAtivo: false }));
  assert.equal(r.motivo, "nao_associado");
});

test("com combo não combina", () => {
  assert.equal(avaliarPeriodoGratuito(base({ temCombo: true })).motivo, "com_combo");
});

test("multi-sala é inelegível", () => {
  assert.equal(avaliarPeriodoGratuito(base({ salaCount: 2 })).motivo, "multi_sala");
});

test("sala sem regra (ou inativa) é inelegível", () => {
  assert.equal(avaliarPeriodoGratuito(base({ regra: null })).motivo, "sem_regra");
  assert.equal(
    avaliarPeriodoGratuito(base({ regra: { ...REGRA, ativo: false } })).motivo,
    "sem_regra",
  );
});

test("período fora da regra é inelegível", () => {
  assert.equal(avaliarPeriodoGratuito(base({ periodo: "noite" })).motivo, "periodo_fora");
});

test("uso esgotado no ciclo barra", () => {
  const r = avaliarPeriodoGratuito(base({ usoAtual: 1 }));
  assert.equal(r.elegivel, false);
  assert.equal(r.motivo, "esgotado");
});

test("limite maior que 1 permite usos intermediários", () => {
  const regra = { ...REGRA, usosPorCiclo: 3 };
  assert.equal(avaliarPeriodoGratuito(base({ regra, usoAtual: 2 })).elegivel, true);
  assert.equal(avaliarPeriodoGratuito(base({ regra, usoAtual: 3 })).motivo, "esgotado");
});

test("ciclo é o 1º dia do mês do evento", () => {
  assert.equal(cicloDeData("2026-07-16"), "2026-07-01");
  assert.equal(cicloDeData("2026-12-31"), "2026-12-01");
});
