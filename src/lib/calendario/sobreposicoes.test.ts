import assert from "node:assert/strict";
import { test } from "node:test";
import { detectarSobreposicoes, idsEmConflito } from "./sobreposicoes.ts";
import type { AgendaItem } from "./tipos.ts";

const item = (over: Partial<AgendaItem>): AgendaItem => ({
  id: "a",
  salaId: "s1",
  salaNome: "Sala 1",
  inicioUtc: "2026-07-17T13:00:00Z",
  fimUtc: "2026-07-17T16:00:00Z",
  origem: "locacao",
  bloqueante: false,
  responsavelId: null,
  responsavelNome: null,
  ...over,
});

test("pendente × bloqueante na mesma sala gera sobreposição", () => {
  const pendente = item({ id: "p", bloqueante: false, locacaoNumero: 1 });
  const confirmada = item({ id: "c", bloqueante: true, locacaoNumero: 2 });
  const r = detectarSobreposicoes([pendente, confirmada]);
  assert.equal(r.length, 1);
  assert.equal(r[0].salaNome, "Sala 1");
  assert.equal(r[0].envolvidos.length, 2);
});

test("pendente × pendente gera sobreposição", () => {
  const a = item({ id: "a", bloqueante: false });
  const b = item({ id: "b", bloqueante: false });
  assert.equal(detectarSobreposicoes([a, b]).length, 1);
});

test("bloqueante × bloqueante não é falso positivo", () => {
  const a = item({ id: "a", bloqueante: true, origem: "evento_interno" });
  const b = item({ id: "b", bloqueante: true });
  assert.equal(detectarSobreposicoes([a, b]).length, 0);
});

test("bloqueante × bloqueante autorizada gera sobreposição (Spec 31)", () => {
  // Uma locação autorizada coexiste com outra bloqueante no mesmo slot.
  const autorizada = item({
    id: "a",
    bloqueante: true,
    sobreposicaoAutorizada: true,
    locacaoNumero: 1,
  });
  const evento = item({ id: "b", bloqueante: true, origem: "evento_interno" });
  const r = detectarSobreposicoes([autorizada, evento]);
  assert.equal(r.length, 1);
  assert.equal(r[0].categoria, "autorizada");
  assert.equal(
    r[0].envolvidos.find((e) => e.agendaId === "a")?.autorizada,
    true,
  );
});

test("sem interseção temporal não gera conflito", () => {
  const a = item({ id: "a", bloqueante: false });
  const b = item({
    id: "b",
    bloqueante: true,
    inicioUtc: "2026-07-17T16:00:00Z", // encosta no fim de a (bound exclusivo)
    fimUtc: "2026-07-17T18:00:00Z",
  });
  assert.equal(detectarSobreposicoes([a, b]).length, 0);
});

test("salas diferentes nunca conflitam", () => {
  const a = item({ id: "a", salaId: "s1", bloqueante: false });
  const b = item({ id: "b", salaId: "s2", bloqueante: true });
  assert.equal(detectarSobreposicoes([a, b]).length, 0);
});

test("idsEmConflito reúne os agendaIds envolvidos", () => {
  const a = item({ id: "a", bloqueante: false });
  const b = item({ id: "b", bloqueante: true });
  const ids = idsEmConflito(detectarSobreposicoes([a, b]));
  assert.deepEqual([...ids].sort(), ["a", "b"]);
});
