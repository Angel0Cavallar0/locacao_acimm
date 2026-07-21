"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";

const selectClasses =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const STATUS_OPCOES: { valor: string; rotulo: string }[] = [
  { valor: "pendentes", rotulo: "A exportar" },
  { valor: "exportadas", rotulo: "Exportadas" },
  { valor: "estornadas", rotulo: "Estornadas" },
  { valor: "estornadas_exportadas", rotulo: "Estornadas após exportação" },
];

/** Rótulo 'YYYY-MM' → 'mm/aaaa'. */
function rotuloCompetencia(c: string): string {
  const [ano, mes] = c.split("-");
  return `${mes}/${ano}`;
}

export function FiltrosComissoes({
  competencias,
  params,
}: {
  competencias: string[];
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

  const temFiltro = params.comp || params.origem || params.status || params.q;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar nº ou locatário"
          className="h-8 w-52 pl-7 text-xs"
        />
      </div>

      <select
        className={selectClasses}
        value={params.comp ?? ""}
        onChange={(e) => aplicar({ comp: e.target.value || null })}
      >
        <option value="">Todas as competências</option>
        {competencias.map((c) => (
          <option key={c} value={c}>
            {rotuloCompetencia(c)}
          </option>
        ))}
      </select>

      <select
        className={selectClasses}
        value={params.origem ?? ""}
        onChange={(e) => aplicar({ origem: e.target.value || null })}
      >
        <option value="">Locação e coffee</option>
        <option value="locacao">Locação</option>
        <option value="coffee">Coffee break</option>
      </select>

      <select
        className={selectClasses}
        value={params.status ?? ""}
        onChange={(e) => aplicar({ status: e.target.value || null })}
      >
        <option value="">Todos os status</option>
        {STATUS_OPCOES.map((s) => (
          <option key={s.valor} value={s.valor}>
            {s.rotulo}
          </option>
        ))}
      </select>

      {temFiltro ? (
        <button
          type="button"
          onClick={() => {
            setBusca("");
            aplicar({ comp: null, origem: null, status: null, q: null });
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
