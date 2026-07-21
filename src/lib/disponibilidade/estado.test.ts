import assert from "node:assert/strict";
import { test } from "node:test";
import { estadoDoSlot } from "./estado-core.ts";

const SLOT = { inicioMs: 100, fimMs: 200 };

function ocup(inicioMs, fimMs, situacao, titulo = null, sympla = null, url = null) {
  return {
    inicioMs,
    fimMs,
    situacao,
    eventoTitulo: titulo,
    eventoSymplaId: sympla,
    eventoSymplaUrl: url,
  };
}

test("sem ocupação → livre", () => {
  assert.equal(estadoDoSlot(SLOT, []).estado, "livre");
  // ocupação fora do slot não conta
  assert.equal(estadoDoSlot(SLOT, [ocup(0, 50, "ocupado")]).estado, "livre");
});

test("bordas semiabertas: adjacência não conflita", () => {
  assert.equal(estadoDoSlot(SLOT, [ocup(0, 100, "ocupado")]).estado, "livre");
  assert.equal(estadoDoSlot(SLOT, [ocup(200, 300, "ocupado")]).estado, "livre");
});

test("cada situação isolada", () => {
  assert.equal(estadoDoSlot(SLOT, [ocup(120, 160, "solicitado")]).estado, "solicitado");
  assert.equal(estadoDoSlot(SLOT, [ocup(120, 160, "ocupado")]).estado, "ocupado");
  const ev = estadoDoSlot(SLOT, [ocup(120, 160, "evento_acimm", "Palestra", "S1")]);
  assert.equal(ev.estado, "evento_acimm");
  assert.equal(ev.eventoTitulo, "Palestra");
  assert.equal(ev.eventoSymplaId, "S1");
});

test("precedência na sobreposição mista", () => {
  assert.equal(
    estadoDoSlot(SLOT, [ocup(110, 150, "solicitado"), ocup(150, 190, "ocupado")]).estado,
    "ocupado",
  );
  assert.equal(
    estadoDoSlot(SLOT, [
      ocup(110, 150, "ocupado"),
      ocup(150, 190, "evento_acimm", "Curso"),
    ]).estado,
    "evento_acimm",
  );
});

test("dia inteiro conflita com sub-período tomado", () => {
  // slot amplo (dia inteiro) e uma ocupação só à tarde
  const diaInteiro = { inicioMs: 0, fimMs: 1000 };
  assert.equal(
    estadoDoSlot(diaInteiro, [ocup(400, 500, "ocupado")]).estado,
    "ocupado",
  );
});
