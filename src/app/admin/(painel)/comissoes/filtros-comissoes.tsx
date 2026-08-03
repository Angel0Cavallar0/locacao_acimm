"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

const selectClasses =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Filtros da tela de comissões (Ciclo 2): origem + busca. A visão (a pagar /
 * previsões) é escolhida nas abas; a competência é derivada da visão.
 */
export function FiltrosComissoes({
  params,
}: {
  params: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [busca, setBusca] = useState(params.q ?? "");
  const primeira = useRef(true);

  function aplicar(mudancas: Record<string, string | null>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(mudancas)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    const t = setTimeout(() => {
      if ((params.q ?? "") !== busca) aplicar({ q: busca || null });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  const temFiltro = params.origem || params.q;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar nº, locatário ou código"
          className="h-8 w-56 pl-7 text-xs"
        />
      </div>

      <select
        className={selectClasses}
        value={params.origem ?? ""}
        onChange={(e) => aplicar({ origem: e.target.value || null })}
      >
        <option value="">Locação e coffee</option>
        <option value="locacao">Locação</option>
        <option value="coffee">Coffee break</option>
      </select>

      {temFiltro ? (
        <button
          type="button"
          onClick={() => {
            setBusca("");
            aplicar({ origem: null, q: null });
          }}
          className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink"
        >
          <X className="size-3" />
          limpar
        </button>
      ) : null}
    </div>
  );
}
