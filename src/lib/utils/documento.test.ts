import assert from "node:assert/strict";
import { test } from "node:test";
import { documentoValido, validarCNPJ, validarCPF } from "./documento.ts";

test("CPF válido e inválido", () => {
  assert.ok(validarCPF("529.982.247-25"));
  assert.equal(validarCPF("111.111.111-11"), false); // dígitos repetidos
  assert.equal(validarCPF("529.982.247-24"), false); // dígito errado
  assert.equal(validarCPF("123"), false);
});

test("CNPJ válido e inválido", () => {
  assert.ok(validarCNPJ("11.222.333/0001-81"));
  assert.equal(validarCNPJ("11.111.111/1111-11"), false);
  assert.equal(validarCNPJ("11.222.333/0001-80"), false);
});

test("documentoValido aceita CPF e CNPJ, rejeita o resto", () => {
  assert.ok(documentoValido("52998224725"));
  assert.ok(documentoValido("11222333000181"));
  assert.equal(documentoValido("12345"), false);
});
