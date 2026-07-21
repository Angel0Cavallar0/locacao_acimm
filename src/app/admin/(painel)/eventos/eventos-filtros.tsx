"use client";

import { useRouter } from "next/navigation";
import { PRIORIDADES } from "@/lib/eventos/tipos";

const selectClasses =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function EventosFiltros({
  salas,
  params,
}: {
  salas: { id: string; nome: string }[];
  params: { sala: string; prioridade: string; passados: string; cancelados: string };
}) {
  const router = useRouter();

  function set(chave: string, valor: string) {
    const sp = new URLSearchParams({
      sala: params.sala,
      prioridade: params.prioridade,
      passados: params.passados,
      cancelados: params.cancelados,
    });
    if (valor) sp.set(chave, valor);
    else sp.delete(chave);
    router.push(`/admin/eventos?${sp.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        className={selectClasses}
        value={params.sala}
        onChange={(e) => set("sala", e.target.value)}
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
        value={params.prioridade}
        onChange={(e) => set("prioridade", e.target.value)}
      >
        <option value="">Toda prioridade</option>
        {PRIORIDADES.map((p) => (
          <option key={p.valor} value={p.valor}>
            {p.rotulo}
          </option>
        ))}
      </select>
      <label className="flex items-center gap-1.5 text-xs text-ink-muted">
        <input
          type="checkbox"
          checked={params.passados === "1"}
          onChange={(e) => set("passados", e.target.checked ? "1" : "")}
        />
        Incluir passados
      </label>
      <label className="flex items-center gap-1.5 text-xs text-ink-muted">
        <input
          type="checkbox"
          checked={params.cancelados === "1"}
          onChange={(e) => set("cancelados", e.target.checked ? "1" : "")}
        />
        Incluir cancelados
      </label>
    </div>
  );
}
