import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type CampoDef,
  formatarResposta,
  normalizarOpcoes,
  resolverRespostasFormulario,
  respostaVazia,
  validarRespostas,
} from "./campos-core.ts";

function campo(over: Partial<CampoDef>): CampoDef {
  return {
    id: over.id ?? "c1",
    rotulo: over.rotulo ?? "Campo",
    tipo: over.tipo ?? "texto",
    opcoes: over.opcoes ?? [],
    obrigatorio: over.obrigatorio ?? false,
  };
}

// --- normalizarOpcoes ------------------------------------------------------

test("normaliza opções: trim, remove vazias e duplicatas", () => {
  assert.deepEqual(normalizarOpcoes([" A ", "B", "", "A", "  "]), ["A", "B"]);
});

// --- respostaVazia ---------------------------------------------------------

test("vazio: string em branco, multiseleção sem itens; booleano nunca vazio", () => {
  assert.equal(respostaVazia("texto", "  "), true);
  assert.equal(respostaVazia("texto", "x"), false);
  assert.equal(respostaVazia("multiselecao", []), true);
  assert.equal(respostaVazia("multiselecao", ["a"]), false);
  assert.equal(respostaVazia("booleano", false), false);
});

// --- validarRespostas (o coração do §4) ------------------------------------

test("obrigatório ausente → erro amigável", () => {
  const r = validarRespostas([campo({ id: "a", rotulo: "Nome", obrigatorio: true })], {});
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.erro, /Responda: Nome/);
});

test("chave desconhecida/inativa é descartada (payload adulterado)", () => {
  const r = validarRespostas([campo({ id: "a", tipo: "texto" })], {
    a: "ok",
    hacker: "lixo",
    inativo: "x",
  });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.valores, { a: "ok" });
});

test("número inválido rejeitado; válido coage para number", () => {
  const bad = validarRespostas([campo({ id: "n", tipo: "numero", obrigatorio: true })], {
    n: "abc",
  });
  assert.equal(bad.ok, false);
  const ok = validarRespostas([campo({ id: "n", tipo: "numero" })], { n: "12,5" });
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.valores.n, 12.5);
});

test("seleção fora das opções rejeitada", () => {
  const c = campo({ id: "s", tipo: "selecao", opcoes: ["A", "B"] });
  assert.equal(validarRespostas([c], { s: "Z" }).ok, false);
  const ok = validarRespostas([c], { s: "A" });
  assert.ok(ok.ok);
  if (ok.ok) assert.equal(ok.valores.s, "A");
});

test("multiseleção: valida cada opção e deduplica", () => {
  const c = campo({ id: "m", tipo: "multiselecao", opcoes: ["A", "B", "C"] });
  assert.equal(validarRespostas([c], { m: ["A", "Z"] }).ok, false);
  const ok = validarRespostas([c], { m: ["A", "A", "B"] });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.valores.m, ["A", "B"]);
});

test("booleano coage e não bloqueia obrigatório", () => {
  const c = campo({ id: "b", tipo: "booleano", obrigatorio: true });
  const r = validarRespostas([c], { b: "true" });
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.valores.b, true);
  const r2 = validarRespostas([c], {}); // ausente → false, sem erro
  assert.ok(r2.ok);
  if (r2.ok) assert.equal(r2.valores.b, false);
});

test("data fora do formato ISO rejeitada", () => {
  const c = campo({ id: "d", tipo: "data" });
  assert.equal(validarRespostas([c], { d: "31/12/2026" }).ok, false);
  const ok = validarRespostas([c], { d: "2026-12-31" });
  assert.ok(ok.ok);
});

test("opcional vazio não é gravado (sem lixo)", () => {
  const r = validarRespostas([campo({ id: "a", tipo: "texto" })], { a: "  " });
  assert.ok(r.ok);
  if (r.ok) assert.deepEqual(r.valores, {});
});

// --- formatarResposta ------------------------------------------------------

test("formata: Sim/Não, lista e data BR", () => {
  assert.equal(formatarResposta("booleano", true), "Sim");
  assert.equal(formatarResposta("booleano", false), "Não");
  assert.equal(formatarResposta("multiselecao", ["A", "B"]), "A, B");
  assert.equal(formatarResposta("data", "2026-09-10"), "10/09/2026");
  assert.equal(formatarResposta("texto", "livre"), "livre");
});

// --- resolverRespostasFormulario (id → rótulo atual, §3) -------------------

test("resolve pelo rótulo ATUAL e ordena pelos campos", () => {
  const campos: CampoDef[] = [
    campo({ id: "a", rotulo: "Qual o tipo do evento?", tipo: "texto" }),
    campo({ id: "b", rotulo: "Terá ingressos?", tipo: "booleano" }),
  ];
  const linhas = resolverRespostasFormulario(campos, { b: true, a: "Palestra" });
  assert.deepEqual(linhas, [
    { id: "a", rotulo: "Qual o tipo do evento?", valor: "Palestra" },
    { id: "b", rotulo: "Terá ingressos?", valor: "Sim" },
  ]);
});

test("resolve id sem campo correspondente como 'Campo removido' no fim", () => {
  const campos: CampoDef[] = [campo({ id: "a", rotulo: "Atual", tipo: "texto" })];
  const linhas = resolverRespostasFormulario(campos, { fantasma: "x", a: "y" });
  assert.equal(linhas[0].rotulo, "Atual");
  assert.equal(linhas[1].rotulo, "Campo removido");
});
