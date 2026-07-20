import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ehIsencao,
  locacaoQuitada,
  pagamentoQuitado,
  podeRecompor,
  somaConfere,
  statusInicialItem,
} from "./pagamentos-core.ts";

test("pagamentoQuitado: pago e isento contam; pendente/estornado não", () => {
  assert.ok(pagamentoQuitado("pago"));
  assert.ok(pagamentoQuitado("isento"));
  assert.equal(pagamentoQuitado("pendente"), false);
  assert.equal(pagamentoQuitado("estornado"), false);
});

test("locacaoQuitada exige ao menos um vigente e todos quitados", () => {
  assert.equal(locacaoQuitada([]), false);
  assert.ok(locacaoQuitada(["pago"]));
  assert.ok(locacaoQuitada(["pago", "isento"]));
  assert.equal(locacaoQuitada(["pago", "pendente"]), false);
});

test("locacaoQuitada ignora estornados (histórico)", () => {
  // Estornado foi substituído por um novo pendente equivalente.
  assert.equal(locacaoQuitada(["estornado", "pendente"]), false);
  // Estornado + o novo já pago = quitada.
  assert.ok(locacaoQuitada(["estornado", "pago"]));
  // Só estornado, sem substituto vigente quitado: não quita.
  assert.equal(locacaoQuitada(["estornado"]), false);
});

test("ehIsencao: forma isento ou total zero", () => {
  assert.ok(ehIsencao("isento", 50_000));
  assert.ok(ehIsencao("pix", 0));
  assert.ok(ehIsencao(null, 0));
  assert.equal(ehIsencao("pix", 50_000), false);
  assert.equal(ehIsencao(null, 50_000), false);
});

test("podeRecompor só com todos pendentes", () => {
  assert.ok(podeRecompor(["pendente", "pendente"]));
  assert.equal(podeRecompor(["pendente", "pago"]), false);
  assert.equal(podeRecompor(["isento"]), false);
  assert.equal(podeRecompor(["estornado", "pendente"]), false);
});

test("somaConfere ao centavo", () => {
  assert.ok(somaConfere([35_000, 45_000], 80_000));
  assert.equal(somaConfere([35_000, 45_001], 80_000), false);
  assert.equal(somaConfere([80_000], 80_001), false);
  assert.ok(somaConfere([80_000], 80_000));
});

test("statusInicialItem: isento nasce quitado, demais pendentes", () => {
  assert.equal(statusInicialItem("isento"), "isento");
  assert.equal(statusInicialItem("pix"), "pendente");
  assert.equal(statusInicialItem("boleto_mensalidade"), "pendente");
});
