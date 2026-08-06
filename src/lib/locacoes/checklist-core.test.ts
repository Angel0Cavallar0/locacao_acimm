import assert from "node:assert/strict";
import { test } from "node:test";
import { montarChecklist } from "./checklist-core.ts";

test("aguardando_pagamento: contrato ok, pagamento e evento pendentes", () => {
  const et = montarChecklist({ status: "aguardando_pagamento" });
  const por = Object.fromEntries(et.map((e) => [e.chave, e.estado]));
  assert.equal(por.solicitada, "concluida");
  assert.equal(por.aprovada, "concluida");
  assert.equal(por.contrato_enviado, "concluida");
  assert.equal(por.contrato_assinado, "concluida");
  assert.equal(por.pagamento, "pendente");
  assert.equal(por.realizada, "pendente");
});

test("finalizada: tudo concluído", () => {
  const et = montarChecklist({ status: "finalizada" });
  assert.ok(et.every((e) => e.estado === "concluida"));
});

test("cancelada: etapas não concluídas viram 'cancelada'", () => {
  const et = montarChecklist({ status: "cancelada" });
  const por = Object.fromEntries(et.map((e) => [e.chave, e.estado]));
  assert.equal(por.solicitada, "concluida"); // já existiu
  assert.equal(por.aprovada, "cancelada");
  assert.equal(por.pagamento, "cancelada");
});

test("adicionais com flag geram etapas próprias", () => {
  const et = montarChecklist({
    status: "aprovada",
    temDivulgacao: true,
    divulgacaoAprovada: false,
    temCozinha: true,
    cozinhaConfirmada: true,
  });
  const por = Object.fromEntries(et.map((e) => [e.chave, e.estado]));
  assert.equal(por.divulgacao, "pendente");
  assert.equal(por.cozinha, "concluida");
});

test("sem adicionais não cria etapas de divulgação/cozinha", () => {
  const et = montarChecklist({ status: "aprovada" });
  assert.ok(!et.some((e) => e.chave === "divulgacao"));
  assert.ok(!et.some((e) => e.chave === "cozinha"));
});

test("contrato assinado por evidência, mesmo em aprovada", () => {
  const et = montarChecklist({ status: "aprovada", contratoStatus: "assinado" });
  const por = Object.fromEntries(et.map((e) => [e.chave, e.estado]));
  assert.equal(por.contrato_enviado, "concluida");
  assert.equal(por.contrato_assinado, "concluida");
});
