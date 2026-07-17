import assert from "node:assert/strict";
import { test } from "node:test";
import { mascararDocumento, mascararTelefone } from "./mascaras.ts";

test("máscara de CPF", () => {
  assert.equal(mascararDocumento("52998224725"), "529.982.247-25");
  assert.equal(mascararDocumento("529982"), "529.982");
  assert.equal(mascararDocumento("5299822472"), "529.982.247-2");
});

test("máscara de CNPJ", () => {
  assert.equal(mascararDocumento("11222333000181"), "11.222.333/0001-81");
  assert.equal(mascararDocumento("112223330001"), "11.222.333/0001");
});

test("máscara descarta não-dígitos e limita tamanho", () => {
  assert.equal(mascararDocumento("529.982.247-25xx"), "529.982.247-25");
  assert.equal(mascararDocumento("1122233300018199"), "11.222.333/0001-81");
});

test("máscara de telefone celular e fixo", () => {
  assert.equal(mascararTelefone("11987654321"), "(11) 98765-4321");
  assert.equal(mascararTelefone("1133334444"), "(11) 3333-4444");
  assert.equal(mascararTelefone("11"), "(11");
  assert.equal(mascararTelefone("119"), "(11) 9");
  assert.equal(mascararTelefone(""), "");
});
