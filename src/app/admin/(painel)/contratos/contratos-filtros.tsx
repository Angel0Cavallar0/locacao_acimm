"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const dateClasses =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Filtros de contratos (Ciclo 2 / Spec 30 §4.2): associado + período. */
export function ContratosFiltros({
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

  const temFiltro = params.q || params.de || params.ate;

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Associado, nº ou documento"
          className="h-8 w-56 pl-7 text-xs"
        />
      </div>
      <div className="flex flex-col gap-0.5">
        <Label htmlFor="c-de" className="text-[11px] text-ink-muted">
          De
        </Label>
        <input
          id="c-de"
          type="date"
          className={dateClasses}
          value={params.de ?? ""}
          onChange={(e) => aplicar({ de: e.target.value || null })}
        />
      </div>
      <div className="flex flex-col gap-0.5">
        <Label htmlFor="c-ate" className="text-[11px] text-ink-muted">
          Até
        </Label>
        <input
          id="c-ate"
          type="date"
          className={dateClasses}
          value={params.ate ?? ""}
          onChange={(e) => aplicar({ ate: e.target.value || null })}
        />
      </div>
      {temFiltro ? (
        <button
          type="button"
          onClick={() => {
            setBusca("");
            aplicar({ q: null, de: null, ate: null });
          }}
          className="inline-flex h-8 items-center gap-1 text-xs text-ink-muted hover:text-ink"
        >
          <X className="size-3" />
          limpar
        </button>
      ) : null}
    </div>
  );
}
