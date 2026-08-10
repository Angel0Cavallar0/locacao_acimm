import assert from "node:assert/strict";
import { test } from "node:test";
import {
  apurarCompetencia,
  type ConfigComissoes,
  faixaDoTotal,
  faltaParaMeta,
  maiorPercentualConfigurado,
  metasBatidas,
  ordenarFaixas,
  parsearConfigComissoes,
  percentualDaFaixa,
  serializarConfigComissoes,
} from "./apuracao-core.ts";

// Regra da ACIMM (Spec 33): locação 5%/6% em 10k; coffee 3%/5% em 12k; bônus 7%.
const CFG: ConfigComissoes = {
  locacao: {
    ativo: true,
    faixas: [
      { ateCentavos: 1000000, percentual: 5 },
      { ateCentavos: null, percentual: 6 },
    ],
  },
  coffee: {
    ativo: true,
    faixas: [
      { ateCentavos: 1200000, percentual: 3 },
      { ateCentavos: null, percentual: 5 },
    ],
  },
  bonus: {
    ativo: true,
    percentual: 7,
    metaLocacaoCentavos: 1000000,
    metaCoffeeCentavos: 1200000,
  },
};

// --- faixas ----------------------------------------------------------------

test("faixa: teto é INCLUSIVO — exatamente no limite fica na faixa de baixo", () => {
  assert.equal(percentualDaFaixa(CFG.locacao.faixas, 0), 5);
  assert.equal(percentualDaFaixa(CFG.locacao.faixas, 999999), 5);
  assert.equal(percentualDaFaixa(CFG.locacao.faixas, 1000000), 5); // "até 10.000"
  assert.equal(percentualDaFaixa(CFG.locacao.faixas, 1000001), 6); // "acima de"
});

test("faixa: decide pela ordem correta mesmo com JSON desordenado", () => {
  const bagunçadas = [
    { ateCentavos: null, percentual: 6 },
    { ateCentavos: 1000000, percentual: 5 },
  ];
  assert.equal(percentualDaFaixa(bagunçadas, 500000), 5);
  assert.equal(ordenarFaixas(bagunçadas)[0].ateCentavos, 1000000);
});

test("faixa: lista vazia → 0% e faixa nula", () => {
  assert.equal(percentualDaFaixa([], 999999), 0);
  assert.equal(faixaDoTotal([], 100), null);
});

test("faixa: sem faixa aberta, total acima do maior teto → 0%", () => {
  const soTeto = [{ ateCentavos: 1000, percentual: 5 }];
  assert.equal(percentualDaFaixa(soTeto, 500), 5);
  assert.equal(percentualDaFaixa(soTeto, 5000), 0);
});

// --- metas e bônus ---------------------------------------------------------

test("meta: comparação ESTRITA — no valor cravado NÃO bate", () => {
  assert.equal(
    metasBatidas(CFG.bonus, { locacaoCentavos: 1000000, coffeeCentavos: 1300000 }),
    false,
  );
  assert.equal(
    metasBatidas(CFG.bonus, { locacaoCentavos: 1000001, coffeeCentavos: 1200001 }),
    true,
  );
});

test("faltaParaMeta: na igualdade ainda falta 1 centavo", () => {
  assert.equal(faltaParaMeta(1000000, 1000000), 1);
  assert.equal(faltaParaMeta(1000001, 1000000), 0);
  assert.equal(faltaParaMeta(900000, 1000000), 100001);
});

test("bônus: as duas metas batidas → 7% nas DUAS origens", () => {
  const a = apurarCompetencia(CFG, {
    locacaoCentavos: 1200000,
    coffeeCentavos: 1300000,
  });
  assert.equal(a.bonusAplicado, true);
  assert.equal(a.percentualLocacao, 7);
  assert.equal(a.percentualCoffee, 7);
});

test("bônus: só uma meta batida → faixas normais", () => {
  const a = apurarCompetencia(CFG, {
    locacaoCentavos: 1200000,
    coffeeCentavos: 1100000,
  });
  assert.equal(a.bonusAplicado, false);
  assert.equal(a.percentualLocacao, 6);
  assert.equal(a.percentualCoffee, 3);
  assert.equal(a.faltaCoffeeCentavos, 100001);
  assert.equal(a.faltaLocacaoCentavos, 0);
});

test("bônus: desligado é ignorado mesmo com as duas metas batidas", () => {
  const cfg = { ...CFG, bonus: { ...CFG.bonus, ativo: false } };
  const a = apurarCompetencia(cfg, {
    locacaoCentavos: 1200000,
    coffeeCentavos: 1300000,
  });
  assert.equal(a.bonusAplicado, false);
  assert.equal(a.percentualLocacao, 6);
  assert.equal(a.percentualCoffee, 5);
});

test("bônus: exige os DOIS grupos ativos", () => {
  const cfg = { ...CFG, coffee: { ...CFG.coffee, ativo: false } };
  const a = apurarCompetencia(cfg, {
    locacaoCentavos: 1200000,
    coffeeCentavos: 1300000,
  });
  assert.equal(a.bonusAplicado, false);
  assert.equal(a.percentualCoffee, 0);
  assert.equal(a.percentualLocacao, 6);
});

test("bônus SUBSTITUI mesmo sendo menor que a faixa (erro de config, não silenciar)", () => {
  const cfg: ConfigComissoes = {
    ...CFG,
    locacao: {
      ativo: true,
      faixas: [
        { ateCentavos: 1000000, percentual: 5 },
        { ateCentavos: null, percentual: 8 },
      ],
    },
  };
  const a = apurarCompetencia(cfg, {
    locacaoCentavos: 1200000,
    coffeeCentavos: 1300000,
  });
  assert.equal(a.bonusAplicado, true);
  assert.equal(a.percentualLocacao, 7); // 7 < 8, e ainda assim substitui
  assert.equal(maiorPercentualConfigurado(cfg), 8);
});

test("grupo inativo → 0% e faixa nula", () => {
  const cfg = { ...CFG, locacao: { ...CFG.locacao, ativo: false } };
  const a = apurarCompetencia(cfg, {
    locacaoCentavos: 5000000,
    coffeeCentavos: 0,
  });
  assert.equal(a.percentualLocacao, 0);
  assert.equal(a.faixaLocacao, null);
});

// --- parse / serialize -----------------------------------------------------

test("parse: formato v2 com faixas", () => {
  const cfg = parsearConfigComissoes({
    versao: 2,
    locacao: {
      ativo: true,
      faixas: [
        { ate_centavos: 1000000, percentual: 5 },
        { ate_centavos: null, percentual: 6 },
      ],
    },
    coffee: { ativo: false, faixas: [{ ate_centavos: null, percentual: 3 }] },
    bonus: {
      ativo: true,
      percentual: 7,
      meta_locacao_centavos: 1000000,
      meta_coffee_centavos: 1200000,
    },
  });
  assert.equal(cfg.locacao.faixas.length, 2);
  assert.equal(cfg.locacao.faixas[0].ateCentavos, 1000000);
  assert.equal(cfg.locacao.faixas[1].ateCentavos, null);
  assert.equal(cfg.bonus.metaCoffeeCentavos, 1200000);
  assert.equal(cfg.coffee.ativo, false);
});

test("parse: formato LEGADO (percentual escalar) vira faixa única aberta", () => {
  const cfg = parsearConfigComissoes({
    locacao: { ativo: true, percentual: 5 },
    coffee: { ativo: true, percentual: 3 },
  });
  assert.deepEqual(cfg.locacao.faixas, [{ ateCentavos: null, percentual: 5 }]);
  assert.equal(percentualDaFaixa(cfg.locacao.faixas, 99999999), 5); // flat
  assert.equal(cfg.bonus.ativo, false); // nunca herdado do legado
});

test("parse: defaults quando vazio/nulo", () => {
  for (const v of [null, {}, undefined]) {
    const cfg = parsearConfigComissoes(v);
    assert.equal(cfg.locacao.ativo, false);
    assert.deepEqual(cfg.locacao.faixas, []);
    assert.equal(cfg.bonus.ativo, false);
  }
});

test("parse: percentual fora de 0..100 e não-numérico são saneados", () => {
  const cfg = parsearConfigComissoes({
    locacao: { ativo: true, faixas: [{ ate_centavos: null, percentual: 150 }] },
    coffee: { ativo: true, faixas: [{ ate_centavos: null, percentual: "abc" }] },
  });
  assert.equal(cfg.locacao.faixas[0].percentual, 100);
  assert.equal(cfg.coffee.faixas[0].percentual, 0);
});

test("parse: deduplica tetos e mantém uma única faixa aberta", () => {
  const cfg = parsearConfigComissoes({
    locacao: {
      ativo: true,
      faixas: [
        { ate_centavos: 1000000, percentual: 5 },
        { ate_centavos: 1000000, percentual: 9 },
        { ate_centavos: null, percentual: 6 },
        { ate_centavos: null, percentual: 7 },
      ],
    },
  });
  assert.equal(cfg.locacao.faixas.length, 2);
  assert.equal(cfg.locacao.faixas[0].percentual, 5); // mantém o primeiro teto
  assert.equal(cfg.locacao.faixas[1].percentual, 7); // mantém a última aberta
});

test("serializar: round-trip preserva a config v2", () => {
  const json = serializarConfigComissoes(CFG);
  assert.deepEqual(parsearConfigComissoes(json), CFG);
});

// --- fechamento de centavos ------------------------------------------------

test("total do mês é a SOMA das linhas, não floor(baseTotal x pct)", () => {
  // 3 linhas de 3333 centavos a 6%: cada uma 199.98 → 199 (floor por linha).
  const bases = [3333, 3333, 3333];
  const porLinha = bases.map((b) => Math.floor((b * 6) / 100));
  const somaLinhas = porLinha.reduce((s, v) => s + v, 0);
  const sobreTotal = Math.floor((9999 * 6) / 100);

  assert.deepEqual(porLinha, [199, 199, 199]);
  assert.equal(somaLinhas, 597);
  assert.equal(sobreTotal, 599); // divergiria em 2 centavos
  assert.ok(sobreTotal - somaLinhas <= bases.length - 1);
});
