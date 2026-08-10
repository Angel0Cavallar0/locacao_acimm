"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConfigComissoes } from "@/lib/comissoes/apuracao-core";
import { brlParaCentavos, centavosParaBRL } from "@/lib/utils/moeda";
import { salvarConfigComissoesAction } from "./actions";

/**
 * Faixas, metas e bônus (Spec 33 §9.2). Admin only — o servidor (requireAdmin) é
 * a autoridade; aqui só renderizamos quando podeEditar.
 *
 * Ciclo 3: salvar RECALCULA as competências ainda abertas (o percentual é do mês,
 * não da linha). Competências fechadas ficam congeladas.
 */

interface FaixaForm {
  /** '' na faixa sem teto. Valor em reais (ex.: '10.000,00'). */
  ate: string;
  percentual: string;
}

interface GrupoForm {
  ativo: boolean;
  faixas: FaixaForm[];
}

function paraForm(g: ConfigComissoes["locacao"]): GrupoForm {
  const faixas =
    g.faixas.length > 0
      ? g.faixas.map((f) => ({
          ate: f.ateCentavos === null ? "" : centavosParaBRL(f.ateCentavos),
          percentual: String(f.percentual),
        }))
      : [{ ate: "", percentual: "0" }];
  return { ativo: g.ativo, faixas };
}

function paraPayload(g: GrupoForm) {
  return {
    ativo: g.ativo,
    faixas: g.faixas.map((f, i) => ({
      // A última é sempre a faixa aberta ("acima disso").
      ateCentavos:
        i === g.faixas.length - 1 ? null : brlParaCentavos(f.ate || "0"),
      percentual: Number(f.percentual.replace(",", ".")) || 0,
    })),
  };
}

function EditorGrupo({
  titulo,
  descricao,
  valor,
  aoMudar,
}: {
  titulo: string;
  descricao: string;
  valor: GrupoForm;
  aoMudar: (g: GrupoForm) => void;
}) {
  const ultima = valor.faixas.length - 1;

  function mudarFaixa(i: number, patch: Partial<FaixaForm>) {
    const faixas = valor.faixas.map((f, idx) =>
      idx === i ? { ...f, ...patch } : f,
    );
    aoMudar({ ...valor, faixas });
  }

  function adicionar() {
    // A nova faixa com teto entra ANTES da aberta, que permanece por último.
    const faixas = [...valor.faixas];
    faixas.splice(ultima, 0, { ate: "", percentual: "0" });
    aoMudar({ ...valor, faixas });
  }

  function remover(i: number) {
    if (valor.faixas.length <= 1) return;
    aoMudar({ ...valor, faixas: valor.faixas.filter((_, idx) => idx !== i) });
  }

  return (
    <div className="rounded-lg border p-3">
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          className="size-4"
          checked={valor.ativo}
          onChange={(e) => aoMudar({ ...valor, ativo: e.target.checked })}
        />
        <span className="text-sm font-medium text-ink">{titulo}</span>
      </label>
      <p className="mt-1 text-xs text-ink-muted">{descricao}</p>

      <div className="mt-3 flex flex-col gap-2">
        {valor.faixas.map((f, i) => {
          const ehUltima = i === ultima;
          return (
            <div
              key={`${titulo}-faixa-${i}`}
              className="flex flex-wrap items-end gap-2"
            >
              <div className="flex flex-col gap-1">
                <Label className="text-xs">
                  {ehUltima ? "Acima do último limite" : "Até (R$)"}
                </Label>
                <Input
                  className="h-9 w-36"
                  inputMode="decimal"
                  placeholder={ehUltima ? "—" : "10.000,00"}
                  disabled={ehUltima}
                  value={ehUltima ? "" : f.ate}
                  onChange={(e) => mudarFaixa(i, { ate: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Percentual (%)</Label>
                <Input
                  className="h-9 w-24"
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={f.percentual}
                  onChange={(e) =>
                    mudarFaixa(i, { percentual: e.target.value })
                  }
                />
              </div>
              {!ehUltima ? (
                <Button
                  size="sm"
                  variant="ghost"
                  type="button"
                  onClick={() => remover(i)}
                >
                  Remover
                </Button>
              ) : null}
            </div>
          );
        })}
      </div>

      <Button
        size="sm"
        variant="outline"
        type="button"
        className="mt-2"
        onClick={adicionar}
      >
        + Faixa
      </Button>
    </div>
  );
}

export function ConfigComissoes({
  configInicial,
}: {
  configInicial: ConfigComissoes;
}) {
  const [locacao, setLocacao] = useState<GrupoForm>(
    paraForm(configInicial.locacao),
  );
  const [coffee, setCoffee] = useState<GrupoForm>(
    paraForm(configInicial.coffee),
  );
  const [bonusAtivo, setBonusAtivo] = useState(configInicial.bonus.ativo);
  const [bonusPct, setBonusPct] = useState(
    String(configInicial.bonus.percentual),
  );
  const [metaLocacao, setMetaLocacao] = useState(
    centavosParaBRL(configInicial.bonus.metaLocacaoCentavos),
  );
  const [metaCoffee, setMetaCoffee] = useState(
    centavosParaBRL(configInicial.bonus.metaCoffeeCentavos),
  );
  const [salvando, setSalvando] = useState(false);

  // O bônus SUBSTITUI as alíquotas — se for menor que a maior faixa, bater as
  // metas reduziria a comissão. Erro de configuração, não silenciamos.
  const maiorFaixa = Math.max(
    ...[...locacao.faixas, ...coffee.faixas].map(
      (f) => Number(f.percentual.replace(",", ".")) || 0,
    ),
    0,
  );
  const bonusMenor =
    bonusAtivo && Number(bonusPct.replace(",", ".")) < maiorFaixa;

  function usarLimitesDasFaixas() {
    const ultimoTeto = (g: GrupoForm) =>
      g.faixas.length >= 2 ? g.faixas[g.faixas.length - 2].ate : "";
    setMetaLocacao(ultimoTeto(locacao));
    setMetaCoffee(ultimoTeto(coffee));
  }

  async function salvar() {
    setSalvando(true);
    const r = await salvarConfigComissoesAction({
      locacao: paraPayload(locacao),
      coffee: paraPayload(coffee),
      bonus: {
        ativo: bonusAtivo,
        percentual: Number(bonusPct.replace(",", ".")) || 0,
        metaLocacaoCentavos: brlParaCentavos(metaLocacao || "0"),
        metaCoffeeCentavos: brlParaCentavos(metaCoffee || "0"),
      },
    });
    setSalvando(false);
    if ("erro" in r) return toast.error(r.erro);
    toast.success(
      r.reapuradas.length > 0
        ? `Regra salva. Competências reapuradas: ${r.reapuradas.join(", ")}.`
        : "Regra de comissão salva.",
    );
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            Regra de comissionamento
          </h3>
          <p className="text-xs text-ink-muted">
            As faixas incidem sobre o <strong>total recebido no mês</strong>, com
            alíquota única sobre o total. Salvar recalcula as competências ainda{" "}
            <strong>abertas</strong>; competências fechadas ficam congeladas.
          </p>
        </div>

        <EditorGrupo
          titulo="Locação + Serviços adicionais"
          descricao="Base: valor das salas + serviços adicionais, líquido de descontos."
          valor={locacao}
          aoMudar={setLocacao}
        />
        <EditorGrupo
          titulo="Coffee break"
          descricao="Base: valor do coffee da locação."
          valor={coffee}
          aoMudar={setCoffee}
        />

        <div className="rounded-lg border p-3">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={bonusAtivo}
              onChange={(e) => setBonusAtivo(e.target.checked)}
            />
            <span className="text-sm font-medium text-ink">
              Bônus por metas
            </span>
          </label>
          <p className="mt-1 text-xs text-ink-muted">
            Quando as <strong>duas</strong> metas são superadas no mês, este
            percentual substitui as alíquotas dos dois grupos.
          </p>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Percentual (%)</Label>
              <Input
                className="h-9 w-24"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={bonusPct}
                onChange={(e) => setBonusPct(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Meta Locação + Adicionais (R$)</Label>
              <Input
                className="h-9 w-40"
                inputMode="decimal"
                value={metaLocacao}
                onChange={(e) => setMetaLocacao(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Meta Coffee (R$)</Label>
              <Input
                className="h-9 w-40"
                inputMode="decimal"
                value={metaCoffee}
                onChange={(e) => setMetaCoffee(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              type="button"
              onClick={usarLimitesDasFaixas}
            >
              Usar os limites das faixas
            </Button>
          </div>

          <p className="mt-2 text-xs text-ink-muted">
            As metas são <strong>estritas</strong>: o valor exato do limite ainda
            não bate a meta.
          </p>

          {bonusMenor ? (
            <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
              O bônus ({bonusPct}%) é menor que a maior faixa configurada (
              {maiorFaixa}%) — ao bater as metas a comissão vai{" "}
              <strong>diminuir</strong>.
            </p>
          ) : null}
        </div>

        <Button className="w-fit" loading={salvando} onClick={salvar}>
          Salvar regra
        </Button>
      </CardContent>
    </Card>
  );
}
