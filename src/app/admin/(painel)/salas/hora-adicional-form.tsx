"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CATEGORIAS_HORA_ADICIONAL,
  type CategoriaHoraAdicional,
  CONDICOES,
} from "@/lib/dominio";
import { brlParaCentavos } from "@/lib/utils/moeda";
import { salvarHoraAdicional } from "./precos-actions";

export interface ValorHoraAdicional {
  condicao: string;
  categoria: CategoriaHoraAdicional;
  valorCentavos: number;
}

export function HoraAdicionalForm({
  salaId,
  minutosIniciais,
  valoresIniciais,
}: {
  salaId: string;
  minutosIniciais: number | null;
  valoresIniciais: ValorHoraAdicional[];
}) {
  const [minutos, setMinutos] = useState(
    minutosIniciais != null ? String(minutosIniciais) : "",
  );
  const [valores, setValores] = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {};
    for (const v of valoresIniciais) {
      m[`${v.condicao}-${v.categoria}`] = (v.valorCentavos / 100)
        .toFixed(2)
        .replace(".", ",");
    }
    return m;
  });
  const [salvando, startSalvar] = useTransition();

  function set(cond: string, cat: string, val: string) {
    setValores((prev) => ({ ...prev, [`${cond}-${cat}`]: val }));
  }

  function salvar() {
    const min = minutos.trim() === "" ? null : Number.parseInt(minutos, 10);
    if (min !== null && (Number.isNaN(min) || min < 0)) {
      toast.error("Informe um valor de minutos válido.");
      return;
    }

    const arr: ValorHoraAdicional[] = [];
    for (const c of CONDICOES) {
      for (const cat of CATEGORIAS_HORA_ADICIONAL) {
        const raw = valores[`${c.valor}-${cat.valor}`];
        if (raw && raw.trim() !== "") {
          arr.push({
            condicao: c.valor,
            categoria: cat.valor,
            valorCentavos: brlParaCentavos(raw),
          });
        }
      }
    }

    startSalvar(async () => {
      const r = await salvarHoraAdicional({ salaId, minutos: min, valores: arr });
      if (r.error) toast.error(r.error);
      else toast.success("Horas adicionais salvas.");
    });
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <h4 className="text-sm font-semibold text-ink">Horas adicionais</h4>
          <p className="text-xs text-ink-muted">
            Valor cobrado por hora extra além do período contratado.
          </p>
        </div>

        <div className="flex max-w-xs flex-col gap-1.5">
          <Label htmlFor="ha-min">Cobrar a partir de (minutos)</Label>
          <Input
            id="ha-min"
            type="number"
            min={0}
            value={minutos}
            onChange={(e) => setMinutos(e.target.value)}
            placeholder="Ex.: 15"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="py-1 pr-3 font-medium">Categoria</th>
                {CONDICOES.map((c) => (
                  <th key={c.valor} className="py-1 pr-3 font-medium">
                    {c.rotulo}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORIAS_HORA_ADICIONAL.map((cat) => (
                <tr key={cat.valor} className="border-t">
                  <td className="py-1.5 pr-3 text-ink">{cat.rotulo}</td>
                  {CONDICOES.map((c) => (
                    <td key={c.valor} className="py-1.5 pr-3">
                      <Input
                        inputMode="decimal"
                        placeholder="0,00"
                        className="h-8 w-28"
                        value={valores[`${c.valor}-${cat.valor}`] ?? ""}
                        onChange={(e) => set(c.valor, cat.valor, e.target.value)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div>
          <Button onClick={salvar} loading={salvando}>
            Salvar horas adicionais
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
