import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calcularDescontoManual,
  somarAdicionais,
  totalCoffee,
  totalGeral,
} from "./calcular-core.ts";

test("somarAdicionais multiplica qtd × unitário e soma", () => {
  assert.equal(
    somarAdicionais([
      { quantidade: 2, valorUnitarioCentavos: 4500 },
      { quantidade: 1, valorUnitarioCentavos: 1000 },
    ]),
    10000,
  );
  assert.equal(somarAdicionais([]), 0);
});

test("somarAdicionais ignora valores negativos", () => {
  assert.equal(
    somarAdicionais([{ quantidade: -3, valorUnitarioCentavos: 500 }]),
    0,
  );
});

test("totalCoffee = valor por pessoa × pessoas + adicionais", () => {
  assert.equal(totalCoffee(2090, 10, 1500), 22400);
  assert.equal(totalCoffee(0, 10, 0), 0);
});

test("totalGeral soma salas+coffee+adicionais e desconta", () => {
  assert.equal(
    totalGeral({
      salasCentavos: 20000,
      coffeeCentavos: 22400,
      adicionaisCentavos: 4500,
      descontosCentavos: 5000,
    }),
    41900,
  );
});

test("calcularDescontoManual percentual arredonda sobre a base", () => {
  assert.equal(
    calcularDescontoManual(10000, { tipo: "percentual", valor: 10 }),
    1000,
  );
  assert.equal(
    calcularDescontoManual(9999, { tipo: "percentual", valor: 33 }),
    3300, // round(9999 * 33 / 100) = round(3299.67)
  );
});

test("calcularDescontoManual percentual trava em 100 e não fica negativo", () => {
  assert.equal(
    calcularDescontoManual(10000, { tipo: "percentual", valor: 150 }),
    10000,
  );
  assert.equal(
    calcularDescontoManual(10000, { tipo: "percentual", valor: -20 }),
    0,
  );
});

test("calcularDescontoManual valor fixo nunca passa da base", () => {
  assert.equal(calcularDescontoManual(10000, { tipo: "valor", valor: 3000 }), 3000);
  assert.equal(calcularDescontoManual(2000, { tipo: "valor", valor: 5000 }), 2000);
});

test("calcularDescontoManual base zero ou negativa devolve zero", () => {
  assert.equal(calcularDescontoManual(0, { tipo: "percentual", valor: 50 }), 0);
  assert.equal(calcularDescontoManual(-500, { tipo: "valor", valor: 100 }), 0);
});
