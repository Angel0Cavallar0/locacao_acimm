import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizarTelefoneBR } from "./telefone.ts";

function num(r: ReturnType<typeof normalizarTelefoneBR>): string | null {
  return "numero" in r ? r.numero : null;
}

test("celular com máscara e DDD é normalizado com 55", () => {
  assert.equal(num(normalizarTelefoneBR("(19) 99999-1234")), "5519999991234");
});

test("aceita número já com 55", () => {
  assert.equal(num(normalizarTelefoneBR("5519999991234")), "5519999991234");
});

test("adiciona o 9 quando vier com 8 dígitos", () => {
  assert.equal(num(normalizarTelefoneBR("1938221234")), "5519938221234");
});

test("DDD inválido falha", () => {
  const r = normalizarTelefoneBR("(00) 99999-1234");
  assert.ok("erro" in r);
});

test("tamanho inválido falha", () => {
  assert.ok("erro" in normalizarTelefoneBR("123"));
  assert.ok("erro" in normalizarTelefoneBR("999999999999999"));
});

test("vazio falha com mensagem", () => {
  const r = normalizarTelefoneBR("");
  assert.ok("erro" in r);
});
