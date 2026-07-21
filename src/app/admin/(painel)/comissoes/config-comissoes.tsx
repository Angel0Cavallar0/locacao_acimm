"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ConfigComissoes } from "@/lib/comissoes/comissoes-core";
import { salvarConfigComissoesAction } from "./actions";

/**
 * Percentuais e toggles por origem (Spec 21 §5). Admin only — o servidor
 * (requireAdmin) é a autoridade; aqui só renderizamos quando podeEditar. Vale
 * para novas confirmações (não recalcula comissões já geradas).
 */

interface LinhaOrigem {
  ativo: boolean;
  percentual: string;
}

function LinhaConfig({
  titulo,
  descricao,
  valor,
  aoMudar,
}: {
  titulo: string;
  descricao: string;
  valor: LinhaOrigem;
  aoMudar: (v: LinhaOrigem) => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border p-3">
      <div className="min-w-0">
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
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`pct-${titulo}`} className="text-xs">
          Percentual (%)
        </Label>
        <Input
          id={`pct-${titulo}`}
          type="number"
          min={0}
          max={100}
          step="0.01"
          className="h-9 w-28"
          value={valor.percentual}
          onChange={(e) => aoMudar({ ...valor, percentual: e.target.value })}
        />
      </div>
    </div>
  );
}

export function ConfigComissoes({
  configInicial,
}: {
  configInicial: ConfigComissoes;
}) {
  const [locacao, setLocacao] = useState<LinhaOrigem>({
    ativo: configInicial.locacao.ativo,
    percentual: String(configInicial.locacao.percentual),
  });
  const [coffee, setCoffee] = useState<LinhaOrigem>({
    ativo: configInicial.coffee.ativo,
    percentual: String(configInicial.coffee.percentual),
  });
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const r = await salvarConfigComissoesAction({
      locacao: { ativo: locacao.ativo, percentual: Number(locacao.percentual) || 0 },
      coffee: { ativo: coffee.ativo, percentual: Number(coffee.percentual) || 0 },
    });
    setSalvando(false);
    if ("erro" in r) return toast.error(r.erro);
    toast.success("Percentuais salvos. Valem para novas confirmações.");
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            Percentuais de comissão
          </h3>
          <p className="text-xs text-ink-muted">
            Aplicados na confirmação de cada locação. Alterar aqui{" "}
            <strong>não</strong> recalcula comissões já geradas — vale só para
            novas confirmações.
          </p>
        </div>

        <LinhaConfig
          titulo="Locação"
          descricao="Base: valor das salas líquido de descontos + adicionais."
          valor={locacao}
          aoMudar={setLocacao}
        />
        <LinhaConfig
          titulo="Coffee break"
          descricao="Base: valor do coffee da locação."
          valor={coffee}
          aoMudar={setCoffee}
        />

        <Button className="w-fit" loading={salvando} onClick={salvar}>
          Salvar percentuais
        </Button>
      </CardContent>
    </Card>
  );
}
