import assert from "node:assert/strict";
import { test } from "node:test";
import { type PayloadNotificacao, templates } from "./templates.ts";

const PAYLOAD_CHEIO: PayloadNotificacao = {
  nome: "Maria Souza",
  loc: "LOC-000123",
  salas: "Auditório",
  data: "20/07/2026",
  horario: "14:00–18:00",
  link: "https://app.acimm.test/locacoes/abc",
  linkAdmin: "https://app.acimm.test/admin/locacoes/abc",
  assinaturaLink: "https://assinar.test/abc",
  motivo: "Sala em manutenção",
  total: "R$ 800,00",
  instrucoes: "Pix: financeiro@acimm.test",
};

// Ferramentas/stack que JAMAIS podem aparecer no conteúdo (CLAUDE.md §1).
const PROIBIDAS = [
  "facioflow",
  "supabase",
  "resend",
  "evolution",
  "autentique",
  "vercel",
  "sympla",
  "n8n",
  "next.js",
];

function semProibidas(texto: string) {
  const t = texto.toLowerCase();
  for (const p of PROIBIDAS) {
    assert.equal(t.includes(p), false, `menção proibida "${p}" em: ${texto.slice(0, 80)}`);
  }
}

test("todo template renderiza os canais que declara, com e sem payload", () => {
  for (const [nome, b] of Object.entries(templates)) {
    if (b.whatsapp) {
      const cheio = b.whatsapp(PAYLOAD_CHEIO);
      assert.ok(cheio.length > 0, `${nome}.whatsapp vazio`);
      semProibidas(cheio);
      // Payload vazio não pode quebrar (fallbacks seguros).
      const vazio = b.whatsapp({});
      assert.ok(vazio.length > 0, `${nome}.whatsapp vazio com payload {}`);
      semProibidas(vazio);
    }
    if (b.email) {
      const cheio = b.email(PAYLOAD_CHEIO);
      assert.ok(cheio.assunto.length > 0 && cheio.html.length > 0, `${nome}.email incompleto`);
      semProibidas(cheio.assunto);
      semProibidas(cheio.html);
      const vazio = b.email({});
      assert.ok(vazio.assunto.length > 0 && vazio.html.length > 0, `${nome}.email vazio`);
      semProibidas(vazio.html);
    }
  }
});

test("internas só têm e-mail; locatário tem WhatsApp", () => {
  assert.equal(templates.interna_nova_solicitacao.whatsapp, undefined);
  assert.equal(templates.interna_comprovante_recebido.whatsapp, undefined);
  assert.equal(templates.interna_comissao_estornada.whatsapp, undefined);
  assert.ok(templates.solicitacao_recebida.whatsapp);
  assert.ok(templates.confirmada.email);
});

test("contrato modo e-mail (sem assinaturaLink) aponta para o e-mail", () => {
  const wpp = templates.contrato_enviado.whatsapp?.({ nome: "Ana", loc: "LOC-1" }) ?? "";
  assert.match(wpp, /e-mail/i);
  const wppLink = templates.contrato_enviado.whatsapp?.({
    nome: "Ana",
    loc: "LOC-1",
    assinaturaLink: "https://assinar.test/x",
  }) ?? "";
  assert.match(wppLink, /assinar\.test/);
});

test("cancelada distingue associado x ACIMM", () => {
  const assoc = templates.cancelada.whatsapp?.({ peloAssociado: true, loc: "LOC-1" }) ?? "";
  assert.match(assoc, /cancelamento/i);
  const acimm = templates.cancelada.whatsapp?.({ loc: "LOC-1", motivo: "x" }) ?? "";
  assert.match(acimm, /cancelada/i);
});
