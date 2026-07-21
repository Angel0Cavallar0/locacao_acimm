import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type Intervalo,
  ocupacaoPorSala,
  percentualOcupacao,
  type SlotDisponivel,
  totalOcupacao,
} from "./ocupacao-core.ts";

// Slots de um dia (3 períodos) para 1 sala, em ms fictícios.
const manha: SlotDisponivel = { salaId: "A", inicioMs: 800, fimMs: 1200 };
const tarde: SlotDisponivel = { salaId: "A", inicioMs: 1300, fimMs: 1800 };
const noite: SlotDisponivel = { salaId: "A", inicioMs: 1800, fimMs: 2300 };

test("sem ocupação: 0 bloqueados, total = nº de slots", () => {
  const r = ocupacaoPorSala([manha, tarde, noite], new Map());
  assert.deepEqual(r.get("A"), { bloqueados: 0, total: 3 });
});

test("bloqueio em 1 período conta 1", () => {
  const ocup = new Map<string, Intervalo[]>([
    ["A", [{ inicioMs: 1350, fimMs: 1700 }]], // dentro da tarde
  ]);
  const r = ocupacaoPorSala([manha, tarde, noite], ocup);
  assert.deepEqual(r.get("A"), { bloqueados: 1, total: 3 });
});

test("dia inteiro intersecta os 3 períodos → conta 3", () => {
  const ocup = new Map<string, Intervalo[]>([
    ["A", [{ inicioMs: 800, fimMs: 2300 }]], // cobre tudo
  ]);
  const r = ocupacaoPorSala([manha, tarde, noite], ocup);
  assert.deepEqual(r.get("A"), { bloqueados: 3, total: 3 });
});

test("bordas exclusivas [inicio, fim): encostar não conta", () => {
  const ocup = new Map<string, Intervalo[]>([
    ["A", [{ inicioMs: 1200, fimMs: 1300 }]], // entre manhã(fim 1200) e tarde(inicio 1300)
  ]);
  const r = ocupacaoPorSala([manha, tarde, noite], ocup);
  assert.deepEqual(r.get("A"), { bloqueados: 0, total: 3 });
});

test("ocupações de outra sala não afetam", () => {
  const ocup = new Map<string, Intervalo[]>([
    ["B", [{ inicioMs: 800, fimMs: 2300 }]],
  ]);
  const r = ocupacaoPorSala([manha, tarde, noite], ocup);
  assert.deepEqual(r.get("A"), { bloqueados: 0, total: 3 });
});

test("percentual arredonda; total 0 → 0", () => {
  assert.equal(percentualOcupacao(1, 3), 33);
  assert.equal(percentualOcupacao(2, 3), 67);
  assert.equal(percentualOcupacao(0, 0), 0);
});

test("totalOcupacao soma por sala", () => {
  const porSala = new Map([
    ["A", { bloqueados: 1, total: 3 }],
    ["B", { bloqueados: 3, total: 6 }],
  ]);
  assert.deepEqual(totalOcupacao(porSala), { bloqueados: 4, total: 9 });
});
