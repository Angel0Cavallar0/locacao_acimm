"use client";

import { ArrowRightLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { SalaRemanejo } from "@/lib/eventos/tipos";
import { moverSalaAction } from "../actions";

export function RemanejarPanel({
  eventoId,
  salaAtualNome,
  salaAtualCapacidade,
  candidatas,
  filaEspera,
}: {
  eventoId: string;
  salaAtualNome: string;
  salaAtualCapacidade: number;
  candidatas: SalaRemanejo[];
  filaEspera: number;
}) {
  const router = useRouter();
  const [movendo, setMovendo] = useState<string | null>(null);

  async function mover(salaId: string) {
    setMovendo(salaId);
    const r = await moverSalaAction({ eventoId, salaId });
    setMovendo(null);
    if (r.error) return toast.error(r.error);
    toast.success("Evento remanejado.");
    router.refresh();
  }

  if (candidatas.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Nenhuma sala livre com capacidade suficiente neste horário.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-muted">
        Mover libera <span className="font-medium text-ink">{salaAtualNome}</span>{" "}
        ({salaAtualCapacidade} lugares) para locação.
      </p>
      {filaEspera > 0 ? (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Há {filaEspera} interessado(s) na fila de espera desta sala nesta data.
        </p>
      ) : null}
      <ul className="flex flex-col gap-1.5">
        {candidatas.map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-2 rounded-md border p-2.5"
          >
            <span className="text-sm text-ink">
              {s.nome}{" "}
              <span className="text-xs text-ink-muted">
                ({s.capacidade} lugares)
              </span>
            </span>
            <Button
              variant="outline"
              size="sm"
              loading={movendo === s.id}
              disabled={movendo !== null}
              onClick={() => mover(s.id)}
            >
              <ArrowRightLeft className="size-4" />
              Mover para {s.nome}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
