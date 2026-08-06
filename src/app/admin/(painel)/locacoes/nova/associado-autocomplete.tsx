"use client";

import { Loader2, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { formatarDocumento } from "@/lib/locacoes/tipos";
import { buscarAssociadosAction } from "./actions";
import type { AssociadoBusca } from "./tipos";

export function AssociadoAutocomplete({
  aoSelecionar,
}: {
  aoSelecionar: (a: AssociadoBusca) => void;
}) {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<AssociadoBusca[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (termo.trim().length < 2) {
      setResultados([]);
      return;
    }
    let ativo = true;
    setCarregando(true);
    const t = setTimeout(async () => {
      const r = await buscarAssociadosAction(termo);
      if (!ativo) return;
      setResultados(r);
      setAberto(true);
      setCarregando(false);
    }, 350);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [termo]);

  useEffect(() => {
    function fora(e: MouseEvent) {
      if (caixa.current && !caixa.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, []);

  return (
    <div ref={caixa} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          onFocus={() => resultados.length > 0 && setAberto(true)}
          placeholder="Buscar por nome, razão social, documento ou código…"
          className="pl-8"
          autoComplete="off"
        />
        {carregando ? (
          <Loader2 className="absolute right-2.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-ink-muted" />
        ) : null}
      </div>

      {aberto && resultados.length > 0 ? (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-popover shadow-md">
          {resultados.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => {
                  aoSelecionar(a);
                  setAberto(false);
                  setTermo("");
                }}
                className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left hover:bg-surface-muted"
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium text-ink">
                    {a.nome}
                  </span>
                  <span
                    className={
                      a.situacao === "ativo"
                        ? "shrink-0 rounded-full bg-emerald-500/15 px-2 text-xs text-emerald-700 dark:text-emerald-400"
                        : "shrink-0 rounded-full bg-amber-500/15 px-2 text-xs text-amber-700 dark:text-amber-400"
                    }
                  >
                    {a.situacao}
                  </span>
                </span>
                <span className="truncate text-xs text-ink-muted">
                  {a.codigoSophus != null ? `#${a.codigoSophus} · ` : ""}
                  {a.razaoSocial ?? "—"}
                  {a.documento ? ` · ${formatarDocumento(a.documento)}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {aberto && !carregando && termo.trim().length >= 2 && resultados.length === 0 ? (
        <div className="absolute z-30 mt-1 w-full rounded-lg border bg-popover p-3 text-sm text-ink-muted shadow-md">
          Nenhum associado encontrado.
        </div>
      ) : null}
    </div>
  );
}
