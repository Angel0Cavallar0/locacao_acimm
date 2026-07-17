"use client";

import { Plus } from "lucide-react";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  CONDICOES,
  type CondicaoLocatario,
  DIAS_SEMANA,
  PERIODOS,
  type PeriodoDia,
} from "@/lib/dominio";
import { brlParaCentavos } from "@/lib/utils/moeda";

export interface PrecoEntrada {
  condicao: CondicaoLocatario;
  periodo: PeriodoDia;
  diasSemana: number[];
  valorCentavos: number;
  indisponivel: boolean;
}

const inputClasses =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const rotuloPeriodo = (p: PeriodoDia) =>
  PERIODOS.find((x) => x.valor === p)?.rotulo ?? p;

/**
 * Diálogo de preço reutilizável. `aoSubmeter` é chamado uma vez por período
 * selecionado — na edição envia ao servidor (reajustarPreco); no cadastro
 * apenas acumula em memória (o preço é gravado após criar a sala).
 */
export function PrecoDialog({
  inicial,
  aoSubmeter,
  aoConcluir,
  rotuloBotao = "Adicionar preço",
}: {
  inicial?: PrecoEntrada;
  aoSubmeter: (entrada: PrecoEntrada) => Promise<{ error?: string }>;
  aoConcluir?: () => void;
  rotuloBotao?: string;
}) {
  const [open, setOpen] = useState(false);
  const [condicao, setCondicao] = useState<CondicaoLocatario>(
    inicial?.condicao ?? "associado",
  );
  const [periodos, setPeriodos] = useState<PeriodoDia[]>(
    inicial ? [inicial.periodo] : ["manha"],
  );
  const [dias, setDias] = useState<number[]>(
    inicial?.diasSemana ?? [1, 2, 3, 4, 5],
  );
  const [valor, setValor] = useState(
    inicial ? (inicial.valorCentavos / 100).toFixed(2).replace(".", ",") : "",
  );
  const [indisponivel, setIndisponivel] = useState(
    inicial?.indisponivel ?? false,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, startSalvar] = useTransition();

  function toggleDia(d: number) {
    setDias((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort(),
    );
  }
  function togglePeriodo(p: PeriodoDia) {
    setPeriodos((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  }

  function salvar() {
    setErro(null);
    const valorCentavos = indisponivel ? 0 : brlParaCentavos(valor);
    if (dias.length === 0) {
      setErro("Selecione ao menos um dia.");
      return;
    }
    if (periodos.length === 0) {
      setErro("Selecione ao menos um período.");
      return;
    }
    startSalvar(async () => {
      const erros: string[] = [];
      for (const per of periodos) {
        const r = await aoSubmeter({
          condicao,
          periodo: per,
          diasSemana: dias,
          valorCentavos,
          indisponivel,
        });
        if (r.error) erros.push(`${rotuloPeriodo(per)}: ${r.error}`);
      }
      if (erros.length > 0) {
        setErro(erros.join(" | "));
        return;
      }
      setOpen(false);
      aoConcluir?.();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {inicial ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          Reajustar
        </Button>
      ) : (
        <Button size="sm" type="button" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          {rotuloBotao}
        </Button>
      )}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{inicial ? "Reajustar preço" : "Novo preço"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cond">Condição</Label>
            <select
              id="cond"
              className={inputClasses}
              value={condicao}
              onChange={(e) => setCondicao(e.target.value as CondicaoLocatario)}
            >
              {CONDICOES.map((c) => (
                <option key={c.valor} value={c.valor}>
                  {c.rotulo}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Períodos</Label>
            <div className="flex flex-wrap gap-1">
              {PERIODOS.map((p) => (
                <button
                  key={p.valor}
                  type="button"
                  onClick={() => togglePeriodo(p.valor)}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    periodos.includes(p.valor)
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-input text-ink-muted hover:bg-surface-muted"
                  }`}
                >
                  {p.rotulo}
                </button>
              ))}
            </div>
            <p className="text-xs text-ink-muted">
              Selecione um ou mais períodos para aplicar o mesmo valor.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Dias da semana</Label>
            <div className="flex flex-wrap gap-1">
              {DIAS_SEMANA.map((d) => (
                <button
                  key={d.valor}
                  type="button"
                  onClick={() => toggleDia(d.valor)}
                  className={`rounded-md border px-2 py-1 text-xs ${
                    dias.includes(d.valor)
                      ? "border-brand bg-brand text-brand-foreground"
                      : "border-input text-ink-muted hover:bg-surface-muted"
                  }`}
                >
                  {d.curto}
                </button>
              ))}
            </div>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                className="text-brand hover:underline"
                onClick={() => setDias([1, 2, 3, 4, 5])}
              >
                Seg–Sex
              </button>
              <button
                type="button"
                className="text-brand hover:underline"
                onClick={() => setDias([0, 6])}
              >
                Fim de semana
              </button>
              <button
                type="button"
                className="text-brand hover:underline"
                onClick={() => setDias([0, 1, 2, 3, 4, 5, 6])}
              >
                Todos
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              className="size-4"
              checked={indisponivel}
              onChange={(e) => setIndisponivel(e.target.checked)}
            />
            Sem locação disponível neste período
          </label>

          {!indisponivel ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="valor">Valor (R$)</Label>
              <input
                id="valor"
                inputMode="decimal"
                placeholder="0,00"
                className={inputClasses}
                value={valor}
                onChange={(e) => setValor(e.target.value)}
              />
            </div>
          ) : null}

          {erro ? (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            Cancelar
          </DialogClose>
          <Button type="button" onClick={salvar} loading={salvando}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
