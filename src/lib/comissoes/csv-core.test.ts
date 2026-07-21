import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CABECALHO_COMISSOES,
  escaparCampoCsv,
  montarCsv,
  montarCsvComissoes,
} from "./csv-core.ts";

const BOM = "﻿";

test("escapa campo com delimitador, aspas e quebra de linha", () => {
  assert.equal(escaparCampoCsv("simples"), "simples");
  assert.equal(escaparCampoCsv("Sala A; Sala B"), '"Sala A; Sala B"');
  assert.equal(escaparCampoCsv('diz "oi"'), '"diz ""oi"""');
  assert.equal(escaparCampoCsv("linha1\nlinha2"), '"linha1\nlinha2"');
});

test("montarCsv: BOM no início e CRLF entre linhas", () => {
  const csv = montarCsv(["a", "b"], [["1", "2"]]);
  assert.ok(csv.startsWith(BOM), "deve começar com BOM");
  assert.equal(csv, `${BOM}a;b\r\n1;2\r\n`);
});

test("montarCsvComissoes: cabeçalho correto e centavos crus", () => {
  const csv = montarCsvComissoes([
    {
      competencia: "2026-09",
      locNumero: "LOC-000123",
      locatario: "Empresa X",
      documento: "12345678000199",
      dataEvento: "10/09/2026",
      salas: "Sala Cinza, Espaço Gourmet",
      origem: "Locação",
      baseCentavos: 50000,
      valorCentavos: 5000,
    },
  ]);
  const linhas = csv.slice(BOM.length).trimEnd().split("\r\n");
  assert.equal(linhas[0], CABECALHO_COMISSOES.join(";"));
  assert.equal(
    linhas[1],
    "2026-09;LOC-000123;Empresa X;12345678000199;10/09/2026;Sala Cinza, Espaço Gourmet;Locação;50000;5000",
  );
});

test("montarCsvComissoes: locatário com ; é aspeado", () => {
  const csv = montarCsvComissoes([
    {
      competencia: "2026-07",
      locNumero: "LOC-000001",
      locatario: "Fulano; Cia",
      documento: "11122233344",
      dataEvento: "01/07/2026",
      salas: "Sala",
      origem: "Coffee",
      baseCentavos: 2000,
      valorCentavos: 100,
    },
  ]);
  assert.ok(csv.includes('"Fulano; Cia"'));
});

test("montarCsvComissoes: só cabeçalho quando sem linhas", () => {
  const csv = montarCsvComissoes([]);
  assert.equal(csv, `${BOM}${CABECALHO_COMISSOES.join(";")}\r\n`);
});
