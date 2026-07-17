"use client";

import { AlertTriangle, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { intervaloSP } from "@/lib/calendario/tempo";
import type { Sobreposicao } from "@/lib/calendario/tipos";

export function SobreposicoesPainel({
  sobreposicoes,
}: {
  sobreposicoes: Sobreposicao[];
}) {
  const [aberto, setAberto] = useState(false);
  if (sobreposicoes.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex w-full items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-left text-sm"
      >
        <AlertTriangle className="size-4 shrink-0 text-amber-600" />
        <span className="flex-1 font-medium text-ink">
          {sobreposicoes.length}{" "}
          {sobreposicoes.length === 1
            ? "sobreposição pendente"
            : "sobreposições pendentes"}{" "}
          neste período
        </span>
        <span className="text-xs text-ink-muted underline">Ver</span>
      </button>

      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sobreposições pendentes</SheetTitle>
          </SheetHeader>
          <p className="text-sm text-ink-muted">
            Conflitos que envolvem ao menos uma solicitação aguardando
            aprovação. A decisão é sua — nada é alterado automaticamente.
          </p>
          <ul className="flex flex-col gap-3">
            {sobreposicoes.map((s, i) => (
              <li
                key={`${s.salaNome}-${s.inicioUtc}-${i}`}
                className="rounded-md border p-3"
              >
                <p className="font-medium text-ink">{s.salaNome}</p>
                <p className="text-xs text-ink-muted">
                  {intervaloSP(s.inicioUtc, s.fimUtc)}
                </p>
                <ul className="mt-2 flex flex-col gap-1.5">
                  {s.envolvidos.map((e) => (
                    <li
                      key={e.agendaId}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="flex items-center gap-1.5">
                        {e.pendente ? (
                          <span className="inline-block size-2 rounded-full bg-amber-500" />
                        ) : (
                          <span className="inline-block size-2 rounded-full bg-ink-muted" />
                        )}
                        <span className="text-ink">{e.rotulo}</span>
                      </span>
                      {e.locacaoId ? (
                        <Link
                          href={`/admin/locacoes/${e.locacaoId}`}
                          className={buttonVariants({
                            variant: "ghost",
                            size: "sm",
                          })}
                        >
                          <ExternalLink className="size-4" />
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
