import assert from "node:assert/strict";
import { test } from "node:test";
import {
  exigeValorManual,
  servicoDisponivelPara,
  usaQuantidade,
  valorAdicionalCatalogo,
} from "./core.ts";

test("usaQuantidade: só por_unidade", () => {
  assert.equal(usaQuantidade("por_unidade"), true);
  assert.equal(usaQuantidade("fixo_evento"), false);
  assert.equal(usaQuantidade("sob_consulta"), false);
});

test("exigeValorManual: só sob_consulta", () => {
  assert.equal(exigeValorManual("sob_consulta"), true);
  assert.equal(exigeValorManual("por_unidade"), false);
});

test("valor por_unidade = unitário × quantidade", () => {
  assert.equal(
    valorAdicionalCatalogo({
      modelo: "por_unidade",
      valorUnitarioCentavos: 350,
      quantidade: 4,
      valorManualCentavos: null,
    }),
    1400,
  );
});

test("valor fixo_evento ignora quantidade", () => {
  assert.equal(
    valorAdicionalCatalogo({
      modelo: "fixo_evento",
      valorUnitarioCentavos: 25000,
      quantidade: 5,
      valorManualCentavos: null,
    }),
    25000,
  );
});

test("valor sob_consulta: null sem cotação, valor manual quando informado", () => {
  assert.equal(
    valorAdicionalCatalogo({
      modelo: "sob_consulta",
      valorUnitarioCentavos: null,
      quantidade: 1,
      valorManualCentavos: null,
    }),
    null,
  );
  assert.equal(
    valorAdicionalCatalogo({
      modelo: "sob_consulta",
      valorUnitarioCentavos: null,
      quantidade: 1,
      valorManualCentavos: 8000,
    }),
    8000,
  );
});

test("por_unidade com quantidade inválida → 0", () => {
  assert.equal(
    valorAdicionalCatalogo({
      modelo: "por_unidade",
      valorUnitarioCentavos: 1000,
      quantidade: 0,
      valorManualCentavos: null,
    }),
    0,
  );
});

test("servicoDisponivelPara: sala nula = qualquer; senão precisa estar na locação", () => {
  assert.equal(servicoDisponivelPara(null, ["a", "b"]), true);
  assert.equal(servicoDisponivelPara("b", ["a", "b"]), true);
  assert.equal(servicoDisponivelPara("c", ["a", "b"]), false);
});
