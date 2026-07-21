"use client";

import { ExternalLink, Link2Off } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { dataSP } from "@/lib/calendario/tempo";
import {
  desvincularSymplaAction,
  type SymplaOpcao,
  vincularSymplaAction,
} from "../actions";
import { SymplaSeletor } from "../sympla-seletor";

export function SymplaVinculo({
  eventoId,
  symplaEventId,
  symplaUrl,
  qtdInscritos,
  sincronizadoEmUtc,
  symplaConfigurado,
}: {
  eventoId: string;
  symplaEventId: string | null;
  symplaUrl: string | null;
  qtdInscritos: number | null;
  sincronizadoEmUtc: string | null;
  symplaConfigurado: boolean;
}) {
  const router = useRouter();
  const [acao, setAcao] = useState(false);

  if (!symplaConfigurado) {
    return (
      <p className="text-sm text-ink-muted">
        Integração Sympla indisponível (token não configurado). O restante do
        evento funciona normalmente.
      </p>
    );
  }

  if (symplaEventId) {
    return (
      <div className="flex flex-col gap-2 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="text-ink-muted">Inscritos</span>
          <span className="font-medium text-ink">{qtdInscritos ?? "—"}</span>
        </div>
        {sincronizadoEmUtc ? (
          <p className="text-xs text-ink-muted">
            Sincronizado em {dataSP(sincronizadoEmUtc)}
          </p>
        ) : (
          <p className="text-xs text-ink-muted">Aguardando primeira sincronização.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {symplaUrl ? (
            <a
              href={symplaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline"
            >
              <ExternalLink className="size-4" />
              Ver no Sympla
            </a>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            loading={acao}
            onClick={async () => {
              setAcao(true);
              const r = await desvincularSymplaAction(eventoId);
              setAcao(false);
              if (r.error) return toast.error(r.error);
              toast.success("Evento desvinculado.");
              router.refresh();
            }}
          >
            <Link2Off className="size-4" />
            Desvincular
          </Button>
        </div>
      </div>
    );
  }

  async function vincular(op: SymplaOpcao | null) {
    if (!op) return;
    setAcao(true);
    const r = await vincularSymplaAction({
      eventoId,
      symplaEventId: op.id,
      symplaUrl: op.url || undefined,
    });
    setAcao(false);
    if (r.error) return toast.error(r.error);
    toast.success(r.aviso ?? "Evento vinculado.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-ink-muted">
        Escolha o evento publicado no Sympla para acompanhar inscritos.
      </p>
      <SymplaSeletor onSelecionar={vincular} />
      {acao ? <p className="text-xs text-ink-muted">Vinculando…</p> : null}
    </div>
  );
}
