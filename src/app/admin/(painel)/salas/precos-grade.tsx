"use client";

import { AlertTriangle, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { brlParaCentavos, centavosParaBRL } from "@/lib/utils/moeda";
import { encerrarPreco, reajustarPreco } from "./precos-actions";

export interface PrecoVM {
  id: string;
  condicao: CondicaoLocatario;
  periodo: PeriodoDia;
  diasSemana: number[];
  valorCentavos: number;
  vigenciaInicio: string | null;
  vigenciaFim: string | null;
  vigente: boolean;
}

const inputClasses =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function diasLabel(dias: number[]): string {
  return DIAS_SEMANA.filter((d) => dias.includes(d.valor))
    .map((d) => d.curto)
    .join(", ");
}

function rotuloCondicao(c: CondicaoLocatario) {
  return CONDICOES.find((x) => x.valor === c)?.rotulo ?? c;
}
function rotuloPeriodo(p: PeriodoDia) {
  return PERIODOS.find((x) => x.valor === p)?.rotulo ?? p;
}

function PrecoDialog({
  salaId,
  inicial,
  aoSalvar,
}: {
  salaId: string;
  inicial?: PrecoVM;
  aoSalvar: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [condicao, setCondicao] = useState<CondicaoLocatario>(
    inicial?.condicao ?? "associado",
  );
  const [periodos, setPeriodos] = useState<PeriodoDia[]>(
    inicial ? [inicial.periodo] : ["manha"],
  );
  const [dias, setDias] = useState<number[]>(inicial?.diasSemana ?? [1, 2, 3, 4, 5]);
  const [valor, setValor] = useState(
    inicial ? (inicial.valorCentavos / 100).toFixed(2).replace(".", ",") : "",
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
    const valorCentavos = brlParaCentavos(valor);
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
        const r = await reajustarPreco({
          salaId,
          condicao,
          periodo: per,
          diasSemana: dias,
          valorCentavos,
        });
        if (r.error) erros.push(`${rotuloPeriodo(per)}: ${r.error}`);
      }
      if (erros.length > 0) {
        setErro(erros.join(" | "));
        return;
      }
      toast.success(periodos.length > 1 ? "Preços salvos." : "Preço salvo.");
      setOpen(false);
      aoSalvar();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {inicial ? (
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          Reajustar
        </Button>
      ) : (
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="size-4" />
          Adicionar preço
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
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PrecosGrade({
  salaId,
  precos,
}: {
  salaId: string;
  precos: PrecoVM[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const vigentes = precos.filter((p) => p.vigente);
  const historico = precos.filter((p) => !p.vigente);

  // Cobertura: combinações condição×período sem preço vigente.
  const lacunas: string[] = [];
  for (const c of CONDICOES) {
    for (const p of PERIODOS) {
      const temPreco = vigentes.some(
        (v) => v.condicao === c.valor && v.periodo === p.valor,
      );
      if (!temPreco) lacunas.push(`${p.rotulo} — ${c.rotulo}`);
    }
  }

  function encerrar(preco: PrecoVM) {
    startTransition(async () => {
      const r = await encerrarPreco(preco.id, salaId);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Preço encerrado.");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          Preços por condição × período × dias, com histórico de vigência.
        </p>
        <PrecoDialog salaId={salaId} aoSalvar={() => router.refresh()} />
      </div>

      {lacunas.length > 0 ? (
        <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div>
            <p className="font-medium text-ink">Cobertura incompleta</p>
            <p className="text-ink-muted">
              Sem preço vigente para: {lacunas.join("; ")}. Esses períodos ficam
              indisponíveis para locação na condição correspondente.
            </p>
          </div>
        </div>
      ) : null}

      <Card>
        <CardContent>
          <div className="grid gap-6 sm:grid-cols-2">
            {CONDICOES.map((c) => {
              const doCond = vigentes.filter((v) => v.condicao === c.valor);
              return (
                <div key={c.valor}>
                  <h4 className="mb-2 border-b pb-1 text-sm font-semibold text-ink">
                    {c.rotulo}
                  </h4>
                  {doCond.length === 0 ? (
                    <p className="text-xs text-ink-muted">
                      Nenhum preço vigente.
                    </p>
                  ) : (
                    <ul className="divide-y">
                      {doCond.map((p) => (
                        <li
                          key={p.id}
                          className="flex items-center gap-2 py-2 first:pt-0"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-ink">
                              {centavosParaBRL(p.valorCentavos)}
                            </p>
                            <p className="text-xs text-ink-muted">
                              {rotuloPeriodo(p.periodo)} · {diasLabel(p.diasSemana)}
                            </p>
                          </div>
                          <PrecoDialog
                            salaId={salaId}
                            inicial={p}
                            aoSalvar={() => router.refresh()}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isPending}
                            onClick={() => encerrar(p)}
                          >
                            Encerrar
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {historico.length > 0 ? (
        <details className="rounded-md border">
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-ink">
            Histórico de preços ({historico.length})
          </summary>
          <ul className="divide-y border-t">
            {historico.map((p) => (
              <li key={p.id} className="px-4 py-2 text-xs text-ink-muted">
                <span className="text-ink">{centavosParaBRL(p.valorCentavos)}</span>{" "}
                — {rotuloPeriodo(p.periodo)} · {rotuloCondicao(p.condicao)} ·{" "}
                {diasLabel(p.diasSemana)}
                <Badge variant="outline" className="ml-2">
                  até {p.vigenciaFim ?? "—"}
                </Badge>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
