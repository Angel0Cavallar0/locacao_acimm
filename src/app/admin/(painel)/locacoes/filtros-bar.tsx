"use client";

import { Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { CONDICOES } from "@/lib/dominio";
import { FORMAS_PAGAMENTO } from "@/lib/locacoes/tipos";

const selectClasses =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function FiltrosBar({
  salas,
  params,
}: {
  salas: { id: string; nome: string }[];
  params: Record<string, string>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [busca, setBusca] = useState(params.q ?? "");
  const primeiraRenderizacao = useRef(true);

  function aplicar(mudancas: Record<string, string | null>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(mudancas)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    p.delete("pag"); // qualquer mudança de filtro volta à página 1
    const qs = p.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  // Busca com debounce.
  useEffect(() => {
    if (primeiraRenderizacao.current) {
      primeiraRenderizacao.current = false;
      return;
    }
    const t = setTimeout(() => {
      if ((params.q ?? "") !== busca) aplicar({ q: busca || null });
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  const temFiltro =
    params.sala || params.cond || params.forma || params.de || params.ate || params.q;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-ink-muted" />
        <Input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar nº, nome ou documento"
          className="h-8 w-56 pl-7 text-xs"
        />
      </div>

      <select
        className={selectClasses}
        value={params.sala ?? ""}
        onChange={(e) => aplicar({ sala: e.target.value || null })}
      >
        <option value="">Todas as salas</option>
        {salas.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nome}
          </option>
        ))}
      </select>

      <select
        className={selectClasses}
        value={params.cond ?? ""}
        onChange={(e) => aplicar({ cond: e.target.value || null })}
      >
        <option value="">Associado e não</option>
        {CONDICOES.map((c) => (
          <option key={c.valor} value={c.valor}>
            {c.rotulo}
          </option>
        ))}
      </select>

      <select
        className={selectClasses}
        value={params.forma ?? ""}
        onChange={(e) => aplicar({ forma: e.target.value || null })}
      >
        <option value="">Qualquer pagamento</option>
        {FORMAS_PAGAMENTO.map((f) => (
          <option key={f.valor} value={f.valor}>
            {f.rotulo}
          </option>
        ))}
      </select>

      <div className="flex items-center gap-1 text-xs text-ink-muted">
        de
        <DatePicker
          value={params.de}
          onChange={(v) => aplicar({ de: v || null })}
          placeholder="dd/mm/aaaa"
          className="h-8 w-36"
        />
      </div>
      <div className="flex items-center gap-1 text-xs text-ink-muted">
        até
        <DatePicker
          value={params.ate}
          onChange={(v) => aplicar({ ate: v || null })}
          placeholder="dd/mm/aaaa"
          className="h-8 w-36"
        />
      </div>

      {temFiltro ? (
        <button
          type="button"
          onClick={() => {
            setBusca("");
            aplicar({
              sala: null,
              cond: null,
              forma: null,
              de: null,
              ate: null,
              q: null,
            });
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
