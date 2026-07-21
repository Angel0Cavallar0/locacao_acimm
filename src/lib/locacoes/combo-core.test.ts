import assert from "node:assert/strict";
import { test } from "node:test";
import {
  avaliarElegibilidadeCombo,
  calcularDescontoMultiSala,
  type EntradaElegibilidadeCombo,
  ratearValorFechado,
} from "./combo-core.ts";

// --- ratearValorFechado ----------------------------------------------------

test("rateio proporcional soma exata ao total", () => {
  const r = ratearValorFechado(
    [
      { salaId: "a", valorCentavos: 100 },
      { salaId: "b", valorCentavos: 300 },
    ],
    1000,
  );
  assert.deepEqual(r, [
    { salaId: "a", valorCentavos: 250 },
    { salaId: "b", valorCentavos: 750 },
  ]);
  assert.equal(r.reduce((s, o) => s + o.valorCentavos, 0), 1000);
});

test("resto vai no primeiro item", () => {
  const r = ratearValorFechado(
    [
      { salaId: "a", valorCentavos: 1 },
      { salaId: "b", valorCentavos: 1 },
      { salaId: "c", valorCentavos: 1 },
    ],
    100,
  );
  assert.equal(r.reduce((s, o) => s + o.valorCentavos, 0), 100);
  assert.equal(r[0].valorCentavos, 34); // 33 + resto 1
  assert.equal(r[1].valorCentavos, 33);
});

test("referências zeradas → divisão igual + resto no 1º", () => {
  const r = ratearValorFechado(
    [
      { salaId: "a", valorCentavos: 0 },
      { salaId: "b", valorCentavos: 0 },
    ],
    100,
  );
  assert.equal(r.reduce((s, o) => s + o.valorCentavos, 0), 100);
  assert.deepEqual(r.map((o) => o.valorCentavos), [50, 50]);
});

test("uma sala recebe o total inteiro", () => {
  assert.deepEqual(ratearValorFechado([{ salaId: "a", valorCentavos: 999 }], 222000), [
    { salaId: "a", valorCentavos: 222000 },
  ]);
});

test("lista vazia → vazio", () => {
  assert.deepEqual(ratearValorFechado([], 1000), []);
});

// --- calcularDescontoMultiSala ---------------------------------------------

test("desconto percentual só nas salas marcadas", () => {
  const linhas = calcularDescontoMultiSala(
    [
      { salaId: "cinza", valorCentavos: 30000 },
      { salaId: "gourmet", valorCentavos: 50000 },
    ],
    ["gourmet"],
    "percentual",
    40,
  );
  assert.deepEqual(linhas, [{ salaId: "gourmet", valorCentavos: 20000 }]);
});

test("desconto fixo é limitado ao valor da sala", () => {
  const linhas = calcularDescontoMultiSala(
    [{ salaId: "g", valorCentavos: 50000 }],
    ["g"],
    "valor",
    60000,
  );
  assert.deepEqual(linhas, [{ salaId: "g", valorCentavos: 50000 }]);
});

test("desconto zero não vira linha", () => {
  const linhas = calcularDescontoMultiSala(
    [{ salaId: "g", valorCentavos: 0 }],
    ["g"],
    "percentual",
    40,
  );
  assert.deepEqual(linhas, []);
});

// --- avaliarElegibilidadeCombo ---------------------------------------------

function base(over: Partial<EntradaElegibilidadeCombo> = {}): EntradaElegibilidadeCombo {
  return {
    condicao: "associado",
    associadoAtivo: true,
    ativo: true,
    tipo: "desconto_multi_sala",
    comboSalaIds: ["cinza", "gourmet"],
    salasSelecionadas: ["cinza", "gourmet"],
    todasSalasAtivasIds: ["cinza", "gourmet", "podcast"],
    comboPeriodo: null,
    periodo: "manha",
    ...over,
  };
}

test("multi_sala elegível com todas as salas do combo", () => {
  assert.equal(avaliarElegibilidadeCombo(base()).elegivel, true);
});

test("não-associado / inativo é inelegível", () => {
  assert.equal(avaliarElegibilidadeCombo(base({ condicao: "nao_associado" })).motivo, "nao_associado");
  assert.equal(avaliarElegibilidadeCombo(base({ associadoAtivo: false })).motivo, "nao_associado");
});

test("combo inativo é inelegível", () => {
  assert.equal(avaliarElegibilidadeCombo(base({ ativo: false })).motivo, "combo_inativo");
});

test("multi_sala sem todas as salas do combo → salas_incompletas", () => {
  assert.equal(
    avaliarElegibilidadeCombo(base({ salasSelecionadas: ["cinza"] })).motivo,
    "salas_incompletas",
  );
});

test("multi_sala aceita salas extras além do combo", () => {
  assert.equal(
    avaliarElegibilidadeCombo(base({ salasSelecionadas: ["cinza", "gourmet", "podcast"] }))
      .elegivel,
    true,
  );
});

test("período incompatível quando o combo define período", () => {
  const r = avaliarElegibilidadeCombo(base({ comboPeriodo: "noite", periodo: "manha" }));
  assert.equal(r.motivo, "periodo_incompativel");
});

test("evento_privativo exige todas as salas ativas", () => {
  const priv = base({
    tipo: "evento_privativo",
    comboPeriodo: "dia_inteiro",
    periodo: "dia_inteiro",
  });
  assert.equal(
    avaliarElegibilidadeCombo({ ...priv, salasSelecionadas: ["cinza", "gourmet", "podcast"] })
      .elegivel,
    true,
  );
  assert.equal(
    avaliarElegibilidadeCombo({ ...priv, salasSelecionadas: ["cinza", "gourmet"] }).motivo,
    "salas_faltando_privativo",
  );
});
