import assert from "node:assert/strict";
import { test } from "node:test";
import { agregarChips } from "./agregado-core.ts";
import type { ChipPeriodo } from "./tipos.ts";

function chip(
  estado: ChipPeriodo["estado"],
  precoCentavos: number | null = null,
): ChipPeriodo {
  return {
    periodo: "manha",
    rotulo: "Manhã",
    faixa: { inicio: "08:00", fim: "12:00" },
    estado,
    precoCentavos,
    eventoTitulo: null,
    eventoSymplaId: null,
  };
}

test("todas livres com preço → livre e soma os preços", () => {
  const r = agregarChips([chip("livre", 5000), chip("livre", 3000)]);
  assert.equal(r.estado, "livre");
  assert.equal(r.precoTotal, 8000);
});

test("livre sem preço em uma sala → sem_preco (não avança)", () => {
  const r = agregarChips([chip("livre", 5000), chip("livre", null)]);
  assert.equal(r.estado, "sem_preco");
  assert.equal(r.precoTotal, null);
});

test("ocupado tem a maior precedência", () => {
  const r = agregarChips([
    chip("evento_acimm"),
    chip("solicitado"),
    chip("ocupado"),
    chip("livre", 1000),
  ]);
  assert.equal(r.estado, "ocupado");
  assert.equal(r.precoTotal, null);
});

test("evento_acimm vence solicitado", () => {
  const r = agregarChips([chip("solicitado"), chip("evento_acimm")]);
  assert.equal(r.estado, "evento_acimm");
});

test("livre + solicitado → solicitado", () => {
  const r = agregarChips([chip("livre", 1000), chip("solicitado")]);
  assert.equal(r.estado, "solicitado");
});

test("sem chips → sem_preco", () => {
  assert.equal(agregarChips([]).estado, "sem_preco");
  assert.equal(agregarChips([undefined]).estado, "sem_preco");
});
