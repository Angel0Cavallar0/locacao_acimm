"use client";

import { Lock, LockOpen, RefreshCw, Trophy } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ApuracaoCompetencia } from "@/lib/comissoes/tipos";
import { centavosParaBRL } from "@/lib/utils/moeda";
import {
  fecharCompetenciaAction,
  reabrirCompetenciaAction,
  recalcularCompetenciaAction,
} from "./actions";

/**
 * Apuração da competência (Spec 33 §9.1). O percentual é do MÊS: enquanto aberta
 * a competência reajusta a cada recebimento; fechada, congela para pagamento.
 *
 * Fica acima das abas de propósito — a apuração é sobre um MÊS, enquanto as abas
 * são recortes relativos. Misturar os dois eixos confunde.
 */

function mesBR(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${m}/${ano}`;
}

function GrupoApuracao({
  titulo,
  baseCentavos,
  percentual,
  totalCentavos,
  faixaRotulo,
  metaCentavos,
  faltaCentavos,
  bonusHabilitado,
  bonusAplicado,
}: {
  titulo: string;
  baseCentavos: number;
  percentual: number;
  totalCentavos: number;
  faixaRotulo: string | null;
  metaCentavos: number;
  faltaCentavos: number;
  bonusHabilitado: boolean;
  bonusAplicado: boolean;
}) {
  const semNada = baseCentavos === 0;
  const progresso =
    metaCentavos > 0
      ? Math.min(100, Math.round((baseCentavos / metaCentavos) * 100))
      : 0;

  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs font-medium text-ink-muted">{titulo}</p>
      <p className="mt-1 text-lg font-semibold text-ink">
        {centavosParaBRL(baseCentavos)}
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">
        {semNada
          ? "Nenhuma comissão nesta competência."
          : bonusAplicado
            ? `Bônus de metas → ${percentual}%`
            : (faixaRotulo ?? `${percentual}%`)}
      </p>

      {!semNada ? (
        <p className="mt-2 text-sm text-ink">
          Comissão: <strong>{centavosParaBRL(totalCentavos)}</strong>
        </p>
      ) : null}

      {bonusHabilitado && metaCentavos > 0 ? (
        <div className="mt-2">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className={`h-full ${faltaCentavos === 0 ? "bg-emerald-500" : "bg-brand"}`}
              style={{ width: `${progresso}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            {faltaCentavos === 0
              ? `Meta de ${centavosParaBRL(metaCentavos)} superada.`
              : `Faltam ${centavosParaBRL(faltaCentavos)} para a meta de ${centavosParaBRL(metaCentavos)}.`}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ApuracaoPainel({
  apuracao,
  params,
  ehAdmin,
}: {
  apuracao: ApuracaoCompetencia;
  params: Record<string, string>;
  ehAdmin: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [ocupado, setOcupado] = useState(false);
  const [confirmarFechar, setConfirmarFechar] = useState(false);
  const [confirmarReabrir, setConfirmarReabrir] = useState(false);

  const fechada = apuracao.fechadaEmUtc !== null;
  const vazia = apuracao.qtdLinhas === 0;

  function irParaMes(mes: string) {
    const p = new URLSearchParams(params);
    if (mes) p.set("competencia", mes);
    else p.delete("competencia");
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  async function executar(
    fn: () => Promise<{ ok: true } | { erro: string }>,
    sucesso: string,
  ) {
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if ("erro" in r) return toast.error(r.erro);
    toast.success(sucesso);
    router.refresh();
  }

  return (
    <div className="rounded-lg border bg-surface-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-ink">
            Apuração de {mesBR(apuracao.mes)}
          </h3>
          {fechada ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-ink/10 px-2 py-0.5 text-xs text-ink">
              <Lock className="size-3" />
              Fechada
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-200">
              Em apuração
            </span>
          )}
          {apuracao.bonusAplicado ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200">
              <Trophy className="size-3" />
              Bônus aplicado · {apuracao.bonusPercentual}%
            </span>
          ) : null}
        </div>

        <input
          type="month"
          value={apuracao.mes}
          onChange={(e) => irParaMes(e.target.value)}
          aria-label="Competência"
          className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <GrupoApuracao
          titulo="Locação + Serviços adicionais"
          baseCentavos={apuracao.baseLocacaoCentavos}
          percentual={apuracao.percentualLocacao}
          totalCentavos={apuracao.totalLocacaoCentavos}
          faixaRotulo={apuracao.faixaLocacaoRotulo}
          metaCentavos={apuracao.metaLocacaoCentavos}
          faltaCentavos={apuracao.faltaLocacaoCentavos}
          bonusHabilitado={apuracao.bonusHabilitado}
          bonusAplicado={apuracao.bonusAplicado}
        />
        <GrupoApuracao
          titulo="Coffee break"
          baseCentavos={apuracao.baseCoffeeCentavos}
          percentual={apuracao.percentualCoffee}
          totalCentavos={apuracao.totalCoffeeCentavos}
          faixaRotulo={apuracao.faixaCoffeeRotulo}
          metaCentavos={apuracao.metaCoffeeCentavos}
          faltaCentavos={apuracao.faltaCoffeeCentavos}
          bonusHabilitado={apuracao.bonusHabilitado}
          bonusAplicado={apuracao.bonusAplicado}
        />
      </div>

      {apuracao.divergente ? (
        <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Apuração desatualizada — os valores gravados não batem com as linhas
          atuais. Clique em <strong>Recalcular</strong>.
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">
          {vazia
            ? "Nenhuma comissão nesta competência."
            : fechada
              ? `Congelada${apuracao.fechadaPorNome ? ` por ${apuracao.fechadaPorNome}` : ""} · ${apuracao.qtdLinhas} linha(s) · total ${centavosParaBRL(
                  apuracao.totalLocacaoCentavos + apuracao.totalCoffeeCentavos,
                )}`
              : `${apuracao.qtdLinhas} linha(s) · total ${centavosParaBRL(
                  apuracao.totalLocacaoCentavos + apuracao.totalCoffeeCentavos,
                )} · os valores ainda podem mudar`}
        </p>

        <div className="flex flex-wrap gap-2">
          {!fechada ? (
            <>
              <Button
                size="sm"
                variant="outline"
                loading={ocupado}
                disabled={ocupado || vazia}
                onClick={() =>
                  executar(
                    () => recalcularCompetenciaAction({ mes: apuracao.mes }),
                    "Competência recalculada.",
                  )
                }
              >
                <RefreshCw className="size-3.5" />
                Recalcular
              </Button>
              <Button
                size="sm"
                disabled={ocupado || vazia}
                onClick={() => setConfirmarFechar(true)}
              >
                <Lock className="size-3.5" />
                Fechar competência
              </Button>
            </>
          ) : ehAdmin ? (
            <Button
              size="sm"
              variant="outline"
              disabled={ocupado}
              onClick={() => setConfirmarReabrir(true)}
            >
              <LockOpen className="size-3.5" />
              Reabrir
            </Button>
          ) : null}
        </div>
      </div>

      <AlertDialog open={confirmarFechar} onOpenChange={setConfirmarFechar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Fechar a competência {mesBR(apuracao.mes)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Congela {apuracao.qtdLinhas} linha(s): Locação{" "}
              {apuracao.percentualLocacao}% (
              {centavosParaBRL(apuracao.totalLocacaoCentavos)}) · Coffee{" "}
              {apuracao.percentualCoffee}% (
              {centavosParaBRL(apuracao.totalCoffeeCentavos)})
              {apuracao.bonusAplicado ? " · com bônus de metas" : ""}.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <p className="text-sm text-ink-muted">
            Depois de fechar, novos recebimentos deste mês são lançados na
            próxima competência aberta. As comissões só podem ser marcadas como
            pagas depois do fechamento.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                executar(
                  () => fecharCompetenciaAction({ mes: apuracao.mes }),
                  "Competência fechada.",
                )
              }
            >
              Fechar competência
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmarReabrir} onOpenChange={setConfirmarReabrir}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Reabrir a competência {mesBR(apuracao.mes)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Os percentuais voltam a ser recalculados e podem mudar. Se houver
              comissão já marcada como paga, a reabertura é recusada — desmarque
              antes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                executar(
                  () => reabrirCompetenciaAction({ mes: apuracao.mes }),
                  "Competência reaberta.",
                )
              }
            >
              Reabrir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
