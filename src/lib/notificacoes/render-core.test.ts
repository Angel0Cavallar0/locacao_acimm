import assert from "node:assert/strict";
import { test } from "node:test";
import { renderizarTexto, valorTexto } from "./render-core.ts";

test("substitui variáveis simples", () => {
  assert.equal(
    renderizarTexto("Olá, {{nome}}! Loc {{loc}}.", { nome: "Ana", loc: "LOC-1" }),
    "Olá, Ana! Loc LOC-1.",
  );
});

test("variável ausente vira vazio", () => {
  assert.equal(renderizarTexto("[{{x}}]", {}), "[]");
});

test("fallback usado quando a variável está vazia/ausente", () => {
  assert.equal(renderizarTexto("Olá, {{nome|tudo bem}}!", {}), "Olá, tudo bem!");
  assert.equal(
    renderizarTexto("Olá, {{nome|tudo bem}}!", { nome: "Ana" }),
    "Olá, Ana!",
  );
  assert.equal(renderizarTexto("{{motivo|não informado}}", { motivo: "" }), "não informado");
});

test("número é interpolado como texto", () => {
  assert.equal(renderizarTexto("{{qtd}} pedidos", { qtd: 3 }), "3 pedidos");
});

test("bloco condicional aparece quando a chave tem valor", () => {
  assert.equal(
    renderizarTexto("Fim.{{#link}} Ver: {{link}}{{/link}}", {
      link: "http://x",
    }),
    "Fim. Ver: http://x",
  );
});

test("bloco condicional some quando a chave está vazia", () => {
  assert.equal(
    renderizarTexto("Fim.{{#link}} Ver: {{link}}{{/link}}", { link: "" }),
    "Fim.",
  );
  assert.equal(
    renderizarTexto("Fim.{{#link}} Ver: {{link}}{{/link}}", {}),
    "Fim.",
  );
});

test("múltiplos blocos independentes", () => {
  const fonte = "{{#a}}A{{/a}}{{#b}}B{{/b}}";
  assert.equal(renderizarTexto(fonte, { a: "x" }), "A");
  assert.equal(renderizarTexto(fonte, { a: "x", b: "y" }), "AB");
  assert.equal(renderizarTexto(fonte, {}), "");
});

test("fonte vazia devolve vazio", () => {
  assert.equal(renderizarTexto("", { nome: "Ana" }), "");
});

test("valorTexto ignora tipos não textuais", () => {
  assert.equal(valorTexto({ x: true }, "x"), "");
  assert.equal(valorTexto({ x: null }, "x"), "");
  assert.equal(valorTexto({ x: "ok" }, "x"), "ok");
  assert.equal(valorTexto({ x: 5 }, "x"), "5");
});
