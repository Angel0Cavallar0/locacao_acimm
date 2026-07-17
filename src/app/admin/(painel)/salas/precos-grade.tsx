"use client";

import { AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CONDICOES,
  type CondicaoLocatario,
  DIAS_SEMANA,
  PERIODOS,
  type PeriodoDia,
} from "@/lib/dominio";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { PrecoDialog } from "./preco-dialog";
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

function diasLabel(dias: number[]): string {
  return DIAS_SEMANA.filter((d) => dias.includes(d.valor))
    .map((d) => d.curto)
    .join(", ");
}
const rotuloCondicao = (c: CondicaoLocatario) =>
  CONDICOES.find((x) => x.valor === c)?.rotulo ?? c;
const rotuloPeriodo = (p: PeriodoDia) =>
  PERIODOS.find((x) => x.valor === p)?.rotulo ?? p;

export function PrecosGrade({
  salaId,
  precos,
}: {
  salaId: string;
  precos: PrecoVM[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [alertaAberto, setAlertaAberto] = useState(true);

  const vigentes = precos.filter((p) => p.vigente);
  const historico = precos.filter((p) => !p.vigente);

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

  const salvarNoServidor = () => ({
    aoSubmeter: (e: {
      condicao: CondicaoLocatario;
      periodo: PeriodoDia;
      diasSemana: number[];
      valorCentavos: number;
    }) => reajustarPreco({ salaId, ...e }),
    aoConcluir: () => {
      toast.success("Preço salvo.");
      router.refresh();
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-muted">
          Preços por condição × período × dias, com histórico de vigência.
        </p>
        <PrecoDialog {...salvarNoServidor()} />
      </div>

      {lacunas.length > 0 ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 text-sm">
          <button
            type="button"
            onClick={() => setAlertaAberto((a) => !a)}
            aria-expanded={alertaAberto}
            className="flex w-full items-center gap-2 p-3 text-left"
          >
            <AlertTriangle className="size-4 shrink-0 text-amber-600" />
            <span className="flex-1 font-medium text-ink">
              Cobertura incompleta ({lacunas.length})
            </span>
            {alertaAberto ? (
              <ChevronUp className="size-4 text-ink-muted" />
            ) : (
              <ChevronDown className="size-4 text-ink-muted" />
            )}
          </button>
          {alertaAberto ? (
            <p className="-mt-1 px-3 pb-3 text-ink-muted">
              Sem preço vigente para: {lacunas.join("; ")}. Esses períodos ficam
              indisponíveis para locação na condição correspondente.
            </p>
          ) : null}
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
                            inicial={{
                              condicao: p.condicao,
                              periodo: p.periodo,
                              diasSemana: p.diasSemana,
                              valorCentavos: p.valorCentavos,
                            }}
                            {...salvarNoServidor()}
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
