import { Check } from "lucide-react";
import type { StatusLocacao } from "@/lib/locacoes/maquina-estados-core";
import { cn } from "@/lib/utils";

/** Stepper amigável do fluxo da locação (Spec 12 §3.1). Não é a versão do admin. */

const PASSOS: { rotulo: string; statuses: StatusLocacao[] }[] = [
  { rotulo: "Solicitada", statuses: ["solicitada"] },
  { rotulo: "Em análise", statuses: ["em_analise"] },
  { rotulo: "Aprovada", statuses: ["aprovada"] },
  { rotulo: "Contrato", statuses: ["contrato_enviado", "contrato_assinado"] },
  { rotulo: "Pagamento", statuses: ["aguardando_pagamento"] },
  { rotulo: "Confirmada", statuses: ["confirmada"] },
  { rotulo: "Realizada", statuses: ["realizada", "finalizada"] },
];

export function StepperStatus({ status }: { status: StatusLocacao }) {
  const atual = PASSOS.findIndex((p) => p.statuses.includes(status));

  return (
    <div className="overflow-x-auto">
      <ol className="flex min-w-max items-center gap-1">
        {PASSOS.map((p, i) => {
          const concluido = i < atual;
          const ehAtual = i === atual;
          return (
            <li key={p.rotulo} className="flex items-center gap-1">
              <div className="flex flex-col items-center gap-1">
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full border text-xs font-medium",
                    concluido && "border-brand bg-brand text-white",
                    ehAtual && "border-brand bg-brand/10 text-brand",
                    !concluido && !ehAtual && "border-input text-ink-muted",
                  )}
                >
                  {concluido ? <Check className="size-3.5" /> : i + 1}
                </span>
                <span
                  className={cn(
                    "text-[10px] whitespace-nowrap",
                    ehAtual ? "font-medium text-ink" : "text-ink-muted",
                  )}
                >
                  {p.rotulo}
                </span>
              </div>
              {i < PASSOS.length - 1 ? (
                <span
                  className={cn(
                    "mb-4 h-px w-6",
                    i < atual ? "bg-brand" : "bg-input",
                  )}
                />
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
