"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { listarEventosSymplaAction, type SymplaOpcao } from "./actions";

const selectClasses =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

function dataBR(valor: string | null): string {
  if (!valor) return "";
  const [y, m, d] = valor.slice(0, 10).split("-");
  return d && m && y ? ` — ${d}/${m}/${y}` : "";
}

/** Dropdown dos eventos PUBLICADOS na conta Sympla (sem busca por nome — §5).
 * Carrega ao montar; ao escolher, emite a opção completa (o pai preenche). */
export function SymplaSeletor({
  onSelecionar,
  valorId,
}: {
  onSelecionar: (op: SymplaOpcao | null) => void;
  valorId?: string;
}) {
  const [eventos, setEventos] = useState<SymplaOpcao[] | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  async function carregar() {
    setCarregando(true);
    setErro(null);
    const r = await listarEventosSymplaAction();
    setCarregando(false);
    if (r.error) {
      setErro(r.error);
      return;
    }
    setEventos(r.eventos ?? []);
  }

  useEffect(() => {
    carregar();
  }, []);

  if (carregando) {
    return <p className="text-sm text-ink-muted">Carregando eventos do Sympla…</p>;
  }

  if (erro) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-destructive">{erro}</p>
        <Button variant="outline" size="sm" onClick={carregar} className="self-start">
          <RefreshCw className="size-4" />
          Tentar de novo
        </Button>
      </div>
    );
  }

  if (!eventos || eventos.length === 0) {
    return (
      <div className="flex items-center gap-2">
        <p className="text-sm text-ink-muted">
          Nenhum evento publicado encontrado.
        </p>
        <Button variant="ghost" size="sm" onClick={carregar}>
          <RefreshCw className="size-4" />
          Recarregar
        </Button>
      </div>
    );
  }

  return (
    <select
      className={selectClasses}
      value={valorId ?? ""}
      onChange={(e) => {
        const op = eventos.find((x) => x.id === e.target.value) ?? null;
        onSelecionar(op);
      }}
    >
      <option value="">Selecione um evento do Sympla…</option>
      {eventos.map((ev) => (
        <option key={ev.id} value={ev.id}>
          {ev.name}
          {dataBR(ev.startDate)}
        </option>
      ))}
    </select>
  );
}
