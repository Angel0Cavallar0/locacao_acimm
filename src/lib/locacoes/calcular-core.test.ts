import assert from "node:assert/strict";
import { test } from "node:test";
import { somarAdicionais, totalCoffee, totalGeral } from "./calcular-core.ts";

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
