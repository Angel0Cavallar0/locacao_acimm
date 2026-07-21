"use client";

import { ExternalLink, Link2, Link2Off, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dataSP } from "@/lib/calendario/tempo";
import {
  buscarEventosSymplaAction,
  desvincularSymplaAction,
  type SymplaOpcao,
  vincularSymplaAction,
} from "../actions";

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
  const [termo, setTermo] = useState("");
  const [buscando, setBuscando] = useState(false);
  const [resultados, setResultados] = useState<SymplaOpcao[] | null>(null);
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

  async function buscar() {
    setBuscando(true);
    const r = await buscarEventosSymplaAction(termo);
    setBuscando(false);
    if (r.error) return toast.error(r.error);
    setResultados(r.eventos ?? []);
  }

  async function vincular(op: SymplaOpcao) {
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
    <div className="flex flex-col gap-3">
      <p className="text-xs text-ink-muted">
        Busque o evento correspondente na conta Sympla para acompanhar inscritos.
      </p>
      <div className="flex gap-2">
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Nome do evento no Sympla"
          onKeyDown={(e) => e.key === "Enter" && buscar()}
        />
        <Button variant="outline" loading={buscando} onClick={buscar}>
          <Search className="size-4" />
          Buscar
        </Button>
      </div>

      {resultados ? (
        resultados.length === 0 ? (
          <p className="text-sm text-ink-muted">Nenhum evento encontrado.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {resultados.map((op) => (
              <li
                key={op.id}
                className="flex items-center justify-between gap-2 rounded-md border p-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{op.name}</p>
                  {op.startDate ? (
                    <p className="text-xs text-ink-muted">
                      {dataSP(op.startDate)}
                    </p>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  disabled={acao}
                  onClick={() => vincular(op)}
                >
                  <Link2 className="size-4" />
                  Vincular
                </Button>
              </li>
            ))}
          </ul>
        )
      ) : null}
    </div>
  );
}
