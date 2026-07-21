"use client";

import { CheckCircle2, Clock, Play, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { dataSP, horaSP } from "@/lib/calendario/tempo";
import { executarJobAction } from "./rotinas-actions";

export interface RotinaCron {
  jobname: string;
  schedule: string;
  active: boolean;
  ultimaStatus: string | null;
  ultimaInicioUtc: string | null;
  ultimaMsg: string | null;
}

const META: Record<string, { titulo: string; quando: string }> = {
  "notificacoes-retry": {
    titulo: "Retry de notificações",
    quando: "A cada 15 minutos",
  },
  lembretes: {
    titulo: "Lembretes pré-evento",
    quando: "Diário, 08:00",
  },
  "coffee-pdf": {
    titulo: "PDF semanal de coffee",
    quando: "Segunda, 07:00",
  },
  "sympla-inscritos": {
    titulo: "Sync de inscritos (Sympla)",
    quando: "A cada hora",
  },
  "google-reconciliacao": {
    titulo: "Espelho do Google Agenda",
    quando: "A cada 15 minutos",
  },
};

export function RotinasCron({ rotinas }: { rotinas: RotinaCron[] }) {
  const router = useRouter();
  const [executando, setExecutando] = useState<string | null>(null);

  if (rotinas.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Nenhuma rotina agendada. Verifique a migration do pg_cron.
      </p>
    );
  }

  async function executar(job: string) {
    setExecutando(job);
    const r = await executarJobAction(job);
    setExecutando(null);
    if (r.error) return toast.error(r.error);
    toast.success(r.resumo ?? "Rotina executada.");
    router.refresh();
  }

  return (
    <ul className="flex flex-col gap-2">
      {rotinas.map((r) => {
        const meta = META[r.jobname];
        return (
          <li
            key={r.jobname}
            className="flex flex-col gap-1.5 rounded-lg border p-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">
                  {meta?.titulo ?? r.jobname}
                </p>
                <p className="flex items-center gap-1 text-xs text-ink-muted">
                  <Clock className="size-3.5" />
                  {meta?.quando ?? r.schedule}
                  {!r.active ? " · inativa" : ""}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                loading={executando === r.jobname}
                disabled={executando !== null}
                onClick={() => executar(r.jobname)}
              >
                <Play className="size-4" />
                Executar agora
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
              {r.ultimaStatus ? (
                <span className="inline-flex items-center gap-1">
                  {r.ultimaStatus === "succeeded" ? (
                    <CheckCircle2 className="size-3.5 text-emerald-600" />
                  ) : (
                    <XCircle className="size-3.5 text-destructive" />
                  )}
                  Última:{" "}
                  {r.ultimaInicioUtc
                    ? `${dataSP(r.ultimaInicioUtc)} ${horaSP(r.ultimaInicioUtc)}`
                    : r.ultimaStatus}
                </span>
              ) : (
                <span>Ainda não executada pelo agendador.</span>
              )}
              {r.ultimaMsg && r.ultimaStatus !== "succeeded" ? (
                <span className="text-destructive">· {r.ultimaMsg}</span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
