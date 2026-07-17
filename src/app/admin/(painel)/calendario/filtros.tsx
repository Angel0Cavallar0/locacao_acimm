"use client";

import { Lock, Plus } from "lucide-react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { corDaSala } from "@/lib/calendario/cores";
import { cn } from "@/lib/utils";
import { CATEGORIAS_STATUS, type CategoriaStatus } from "./helpers";

export interface SalaFiltro {
  id: string;
  nome: string;
  ativa: boolean;
}

export function Filtros({
  salas,
  salasSel,
  aoAlternarSala,
  aoTodasSalas,
  aoLimparSalas,
  statusSel,
  aoAlternarStatus,
  responsaveis,
  responsavelSel,
  aoResponsavel,
  contadores,
  aoNovoBloqueio,
}: {
  salas: SalaFiltro[];
  salasSel: Set<string>;
  aoAlternarSala: (id: string) => void;
  aoTodasSalas: () => void;
  aoLimparSalas: () => void;
  statusSel: Set<CategoriaStatus>;
  aoAlternarStatus: (c: CategoriaStatus) => void;
  responsaveis: { id: string; nome: string }[];
  responsavelSel: string | null;
  aoResponsavel: (id: string | null) => void;
  contadores: { locacoes: number; pendentes: number; eventos: number };
  aoNovoBloqueio: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-muted">
          <span className="font-medium text-ink">{contadores.locacoes}</span>{" "}
          locações ·{" "}
          <span className="font-medium text-amber-600">
            {contadores.pendentes}
          </span>{" "}
          pendentes ·{" "}
          <span className="font-medium text-ink">{contadores.eventos}</span>{" "}
          eventos
        </p>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={aoNovoBloqueio}>
            <Lock className="size-4" />
            Novo bloqueio
          </Button>
          <Link
            href="/admin/locacoes/nova"
            className={buttonVariants({ size: "sm" })}
          >
            <Plus className="size-4" />
            Nova locação
          </Link>
        </div>
      </div>

      {/* Legenda + filtro de salas (cor determinística por sala) */}
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-ink-muted">Salas</span>
          <button
            type="button"
            onClick={aoTodasSalas}
            className="text-xs text-brand hover:underline"
          >
            todas
          </button>
          <span className="text-ink-muted">·</span>
          <button
            type="button"
            onClick={aoLimparSalas}
            className="text-xs text-ink-muted hover:underline"
          >
            limpar
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {salas.map((s) => {
            const ativo = salasSel.has(s.id);
            const cor = corDaSala(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => aoAlternarSala(s.id)}
                aria-pressed={ativo}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors",
                  ativo
                    ? "border-transparent text-ink"
                    : "border-border text-ink-muted opacity-60 hover:opacity-100",
                )}
                style={ativo ? { backgroundColor: `${cor.fundo}22` } : undefined}
              >
                <span
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: cor.fundo }}
                />
                {s.nome}
                {!s.ativa ? (
                  <span className="text-[10px] text-ink-muted">(inativa)</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      {/* Filtro de status + responsável */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-ink-muted">Status</span>
          {CATEGORIAS_STATUS.map((c) => {
            const ativo = statusSel.has(c.valor);
            return (
              <button
                key={c.valor}
                type="button"
                onClick={() => aoAlternarStatus(c.valor)}
                aria-pressed={ativo}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors",
                  ativo
                    ? "border-brand bg-brand/10 text-brand"
                    : "border-border text-ink-muted hover:text-ink",
                )}
              >
                {c.rotulo}
              </button>
            );
          })}
        </div>

        {responsaveis.length > 0 ? (
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-ink-muted">
              Responsável
            </span>
            <select
              value={responsavelSel ?? ""}
              onChange={(e) => aoResponsavel(e.target.value || null)}
              className="h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            >
              <option value="">Todos</option>
              {responsaveis.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nome}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>
    </div>
  );
}
