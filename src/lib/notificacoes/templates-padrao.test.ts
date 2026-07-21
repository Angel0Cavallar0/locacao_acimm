import assert from "node:assert/strict";
import { test } from "node:test";
import { renderizarTexto } from "./render-core.ts";
import { CHAVES_TEMPLATE, templatesPadrao } from "./templates-padrao.ts";

// Payload de exemplo cobrindo todas as tags usadas pelos templates.
const EXEMPLO = {
  nome: "Ana Souza",
  loc: "LOC-000123",
  salas: "Sala Azul",
  data: "21/07/2026",
  horario: "08:00–12:00",
  total: "R$ 300,00",
  motivo: "conflito de agenda",
  instrucoes: "Pague via Pix.",
  link: "https://app/loc/1",
  assinaturaLink: "https://assinar/1",
  linkAdmin: "https://app/admin/loc/1",
  sala: "Sala Azul",
  qtd: "2",
  primeiro: "João",
  rotulo: "21/07 a 27/07",
};

test("cada canal declarado tem conteúdo correspondente", () => {
  for (const chave of CHAVES_TEMPLATE) {
    const t = templatesPadrao[chave];
    if (t.canais.includes("whatsapp")) {
      assert.ok(t.whatsapp && t.whatsapp.length > 0, `${chave}: whatsapp`);
    }
    if (t.canais.includes("email")) {
      assert.ok(t.emailAssunto && t.emailAssunto.length > 0, `${chave}: assunto`);
      assert.ok(t.emailCorpo && t.emailCorpo.length > 0, `${chave}: corpo`);
    }
  }
});

test("nenhuma tag fica sem resolver no payload de exemplo", () => {
  const pendente = /\{\{/;
  for (const chave of CHAVES_TEMPLATE) {
    const t = templatesPadrao[chave];
    for (const fonte of [t.whatsapp, t.emailAssunto, t.emailCorpo]) {
      if (!fonte) continue;
      const out = renderizarTexto(fonte, EXEMPLO);
      assert.ok(!pendente.test(out), `${chave}: sobrou tag → ${out}`);
    }
  }
});

test("os 2 templates condicionais foram normalizados em variantes", () => {
  assert.ok(templatesPadrao.cancelada_associado);
  assert.ok(templatesPadrao.cancelada_acimm);
  assert.ok(templatesPadrao.contrato_enviado_autentique);
  assert.ok(templatesPadrao.contrato_enviado_email);
  assert.equal(templatesPadrao.cancelada, undefined);
  assert.equal(templatesPadrao.contrato_enviado, undefined);
});
