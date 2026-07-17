import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calcularItensCoffee,
  converterUnidade,
  type PedidoParaConsolidar,
} from "./calcular-itens-core.ts";

test("agrega item igual entre pedidos por (item, unidade)", () => {
  const pedidos: PedidoParaConsolidar[] = [
    {
      qtdPessoas: 10,
      composicao: [{ item: "Mini sanduíche", qtdPorPessoa: 2, unidade: "un" }],
    },
    {
      qtdPessoas: 5,
      composicao: [{ item: "Mini sanduíche", qtdPorPessoa: 2, unidade: "un" }],
    },
  ];
  const r = calcularItensCoffee(pedidos);
  assert.equal(r.qtdPedidos, 2);
  assert.equal(r.totalPessoas, 15);
  assert.equal(r.itens.length, 1);
  assert.deepEqual(r.itens[0], {
    item: "Mini sanduíche",
    unidade: "un",
    quantidade: 30,
  });
});

test("normaliza caixa e espaços na chave de agregação", () => {
  const r = calcularItensCoffee([
    { qtdPessoas: 4, composicao: [{ item: "Suco", qtdPorPessoa: 1, unidade: "un" }] },
    { qtdPessoas: 6, composicao: [{ item: " suco ", qtdPorPessoa: 1, unidade: "UN" }] },
  ]);
  assert.equal(r.itens.length, 1);
  assert.equal(r.itens[0].quantidade, 10);
});

test("converte ml→L e g→kg ao atingir 1000", () => {
  assert.deepEqual(converterUnidade(3600, "ml"), { quantidade: 3.6, unidade: "L" });
  assert.deepEqual(converterUnidade(1500, "g"), { quantidade: 1.5, unidade: "kg" });
  // Abaixo do limiar, mantém a unidade original.
  assert.deepEqual(converterUnidade(300, "ml"), { quantidade: 300, unidade: "ml" });
});

test("consolidado aplica conversão de unidade no total", () => {
  // 300 ml/pessoa × 12 pessoas = 3600 ml → 3.6 L
  const r = calcularItensCoffee([
    { qtdPessoas: 12, composicao: [{ item: "Suco", qtdPorPessoa: 300, unidade: "ml" }] },
  ]);
  assert.deepEqual(r.itens[0], { item: "Suco", unidade: "L", quantidade: 3.6 });
});

test("período sem pedidos devolve consolidado vazio", () => {
  const r = calcularItensCoffee([]);
  assert.deepEqual(r, { itens: [], totalPessoas: 0, qtdPedidos: 0 });
});

test("ignora itens sem nome e quantidades negativas", () => {
  const r = calcularItensCoffee([
    {
      qtdPessoas: 10,
      composicao: [
        { item: "  ", qtdPorPessoa: 5, unidade: "un" },
        { item: "Água", qtdPorPessoa: -2, unidade: "un" },
      ],
    },
  ]);
  assert.equal(r.itens.length, 1);
  assert.equal(r.itens[0].item, "Água");
  assert.equal(r.itens[0].quantidade, 0);
});

test("ordena itens alfabeticamente (pt-BR)", () => {
  const r = calcularItensCoffee([
    {
      qtdPessoas: 1,
      composicao: [
        { item: "Café", qtdPorPessoa: 1, unidade: "un" },
        { item: "Água", qtdPorPessoa: 1, unidade: "un" },
        { item: "Bolo", qtdPorPessoa: 1, unidade: "un" },
      ],
    },
  ]);
  assert.deepEqual(
    r.itens.map((i) => i.item),
    ["Água", "Bolo", "Café"],
  );
});
