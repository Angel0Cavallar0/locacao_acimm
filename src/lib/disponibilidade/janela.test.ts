import assert from "node:assert/strict";
import { test } from "node:test";
import { respeitaAntecedencia, somarDias } from "./janela.ts";

const HOJE = "2026-07-21";

test("diasMin=0 sempre respeita (sem restrição)", () => {
  assert.equal(respeitaAntecedencia(HOJE, 0, HOJE), true);
  assert.equal(respeitaAntecedencia("2026-07-22", 0, HOJE), true);
});

test("diasMin negativo ou não-finito respeita (sem restrição)", () => {
  assert.equal(respeitaAntecedencia(HOJE, -3, HOJE), true);
  assert.equal(respeitaAntecedencia(HOJE, Number.NaN, HOJE), true);
});

test("respeita quando a data é >= hoje + diasMin", () => {
  assert.equal(respeitaAntecedencia("2026-07-24", 3, HOJE), true);
  assert.equal(respeitaAntecedencia("2026-07-25", 3, HOJE), true);
});

test("não respeita quando a data está dentro do prazo mínimo", () => {
  assert.equal(respeitaAntecedencia("2026-07-23", 3, HOJE), false);
  assert.equal(respeitaAntecedencia(HOJE, 3, HOJE), false);
  assert.equal(respeitaAntecedencia("2026-07-22", 1, HOJE), true);
  assert.equal(respeitaAntecedencia(HOJE, 1, HOJE), false);
});

test("limite exato: data == hoje + diasMin respeita", () => {
  assert.equal(respeitaAntecedencia(somarDias(HOJE, 3), 3, HOJE), true);
});

test("cruza fim de mês corretamente", () => {
  // 2026-07-30 + 3 = 2026-08-02
  assert.equal(respeitaAntecedencia("2026-08-02", 3, "2026-07-30"), true);
  assert.equal(respeitaAntecedencia("2026-08-01", 3, "2026-07-30"), false);
});
