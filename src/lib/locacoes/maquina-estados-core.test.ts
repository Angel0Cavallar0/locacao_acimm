import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ACOES_POR_STATUS,
  ehTerminal,
  exigeMotivo,
  grupoStatus,
  podeEditarAdicionais,
  podeReagendar,
  transicaoPermitida,
} from "./maquina-estados-core.ts";

test("transições válidas do fluxo feliz", () => {
  assert.ok(transicaoPermitida("solicitada", "aprovada"));
  assert.ok(transicaoPermitida("aprovada", "contrato_enviado"));
  assert.ok(transicaoPermitida("aguardando_pagamento", "confirmada"));
  assert.ok(transicaoPermitida("realizada", "finalizada"));
});

test("transições inválidas são rejeitadas", () => {
  assert.equal(transicaoPermitida("solicitada", "confirmada"), false);
  assert.equal(transicaoPermitida("aprovada", "aprovada"), false);
  assert.equal(transicaoPermitida("realizada", "cancelada"), false);
  // pular etapa
  assert.equal(transicaoPermitida("contrato_enviado", "confirmada"), false);
});

test("estados terminais não têm saída", () => {
  assert.ok(ehTerminal("finalizada"));
  assert.ok(ehTerminal("recusada"));
  assert.ok(ehTerminal("cancelada"));
  assert.equal(ehTerminal("solicitada"), false);
});

test("recusar e cancelar exigem motivo", () => {
  assert.ok(exigeMotivo("recusada"));
  assert.ok(exigeMotivo("cancelada"));
  assert.equal(exigeMotivo("aprovada"), false);
});

test("reagendamento e adicionais só até aprovada", () => {
  for (const s of ["solicitada", "em_analise", "aprovada"] as const) {
    assert.ok(podeReagendar(s), s);
    assert.ok(podeEditarAdicionais(s), s);
  }
  for (const s of ["contrato_enviado", "confirmada", "realizada"] as const) {
    assert.equal(podeReagendar(s), false, s);
    assert.equal(podeEditarAdicionais(s), false, s);
  }
});

test("grupo de status para o badge", () => {
  assert.equal(grupoStatus("solicitada"), "pendente");
  assert.equal(grupoStatus("aprovada"), "andamento");
  assert.equal(grupoStatus("finalizada"), "concluida");
  assert.equal(grupoStatus("cancelada"), "encerrada");
});

test("toda ação oferecida é uma transição permitida", () => {
  for (const [de, acoes] of Object.entries(ACOES_POR_STATUS)) {
    for (const a of acoes) {
      assert.ok(
        transicaoPermitida(de as never, a.para),
        `${de} → ${a.para} deveria ser permitida`,
      );
    }
  }
});
