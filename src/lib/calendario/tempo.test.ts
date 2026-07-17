import assert from "node:assert/strict";
import { test } from "node:test";
import { dataSP, horaSP, intervaloSP, utcParaNaiveSP } from "./tempo.ts";

test("utcParaNaiveSP aplica offset -03:00 de São Paulo", () => {
  // 14:00Z → 11:00 em SP, mesmo dia.
  assert.equal(utcParaNaiveSP("2026-07-17T14:00:00Z"), "2026-07-17T11:00:00");
});

test("utcParaNaiveSP retrocede o dia ao cruzar a meia-noite", () => {
  // 01:30Z → 22:30 do dia anterior em SP.
  assert.equal(utcParaNaiveSP("2026-07-17T01:30:00Z"), "2026-07-16T22:30:00");
});

test("horaSP e dataSP formatam no fuso de SP", () => {
  assert.equal(horaSP("2026-07-17T14:00:00Z"), "11:00");
  assert.equal(dataSP("2026-07-17T01:30:00Z"), "16/07/2026");
});

test("intervaloSP mostra o dia do fim só quando difere", () => {
  assert.equal(
    intervaloSP("2026-07-17T13:00:00Z", "2026-07-17T16:00:00Z"),
    "17/07 · 10:00–13:00",
  );
  // Início 22:30 SP (16/07) → fim 00:30 SP (17/07): anota o dia do fim.
  assert.equal(
    intervaloSP("2026-07-17T01:30:00Z", "2026-07-17T03:30:00Z"),
    "16/07 · 22:30–00:30 (17/07)",
  );
});
