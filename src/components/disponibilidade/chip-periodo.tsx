"use client";

import type { ChipPeriodo } from "@/lib/disponibilidade/tipos";
import { cn } from "@/lib/utils";
import { centavosParaBRL } from "@/lib/utils/moeda";

/**
 * Chip de período (livre/solicitado/ocupado/evento/sem preço). Fonte única
 * compartilhada pela disponibilidade (Spec 10) e pela etapa 1 da solicitação
 * (Spec 11) — sem cópias. Só exibe estado; nunca vaza dados de terceiros.
 */

export const CHIP_ESTILO: Record<ChipPeriodo["estado"], string> = {
  livre:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20",
  solicitado:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20",
  ocupado: "border-input bg-surface-muted text-ink-muted",
  evento_acimm: "border-brand/40 bg-brand/10 text-brand hover:bg-brand/20",
  sem_preco: "border-input bg-surface-muted text-ink-muted",
};

export function rotuloEstado(chip: ChipPeriodo, podeSolicitar: boolean): string {
  switch (chip.estado) {
    case "livre":
      return podeSolicitar && chip.precoCentavos !== null
        ? centavosParaBRL(chip.precoCentavos)
        : "Livre";
    case "solicitado":
      return "Solicitado";
    case "ocupado":
      return "Indisponível";
    case "evento_acimm":
      return chip.eventoTitulo ?? "Evento ACIMM";
    case "sem_preco":
      return "Não disponível";
  }
}

/** `sem_preco` e `livre` sem permissão de solicitar são inertes (não clicáveis). */
export function chipInerte(chip: ChipPeriodo, podeSolicitar: boolean): boolean {
  return (
    chip.estado === "sem_preco" ||
    (chip.estado === "livre" && !podeSolicitar)
  );
}

export function ChipPeriodoButton({
  chip,
  podeSolicitar,
  onClick,
  selecionado = false,
  className,
}: {
  chip: ChipPeriodo;
  podeSolicitar: boolean;
  onClick?: () => void;
  selecionado?: boolean;
  className?: string;
}) {
  const inerte = chipInerte(chip, podeSolicitar);
  return (
    <button
      type="button"
      disabled={inerte}
      title={
        chip.estado === "sem_preco"
          ? "Período não disponível para locação"
          : undefined
      }
      onClick={onClick}
      className={cn(
        "flex flex-col items-start rounded-lg border px-2.5 py-1.5 text-left transition-colors",
        CHIP_ESTILO[chip.estado],
        selecionado && "ring-2 ring-brand ring-offset-1",
        inerte && "cursor-default",
        className,
      )}
    >
      <span className="text-xs font-medium">{chip.rotulo}</span>
      <span className="truncate text-xs">
        {rotuloEstado(chip, podeSolicitar)}
      </span>
    </button>
  );
}
