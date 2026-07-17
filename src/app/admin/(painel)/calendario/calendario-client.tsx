"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { idsEmConflito } from "@/lib/calendario/sobreposicoes";
import type { AgendaItem, Sobreposicao } from "@/lib/calendario/tipos";
import { listarAgenda, removerBloqueio } from "./actions";
import { type BloqueioPrefill, BloqueioDialog } from "./bloqueio-dialog";
import { DetalheSheet } from "./detalhe-sheet";
import { Filtros, type SalaFiltro } from "./filtros";
import { type CategoriaStatus, categoriaDoItem, ehPendente } from "./helpers";
import { SobreposicoesPainel } from "./sobreposicoes-painel";

const TODOS_STATUS: CategoriaStatus[] = [
  "pendentes",
  "confirmadas",
  "eventos",
  "bloqueios",
];

const AgendaGrid = dynamic(
  () => import("./agenda-grid").then((m) => m.AgendaGrid),
  {
    ssr: false,
    loading: () => (
      <div className="h-[520px] animate-pulse rounded-lg bg-surface-muted" />
    ),
  },
);

function hojeSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

export interface FiltrosIniciais {
  salas: string[] | null;
  status: CategoriaStatus[] | null;
  responsavel: string | null;
}

export function CalendarioClient({
  salas,
  eventosIniciais,
  sobreposicoesIniciais,
  filtrosIniciais,
}: {
  salas: SalaFiltro[];
  eventosIniciais: AgendaItem[];
  sobreposicoesIniciais: Sobreposicao[];
  filtrosIniciais: FiltrosIniciais;
}) {
  const ativasIds = useMemo(
    () => salas.filter((s) => s.ativa).map((s) => s.id),
    [salas],
  );

  const [eventos, setEventos] = useState<AgendaItem[]>(eventosIniciais);
  const [sobreposicoes, setSobreposicoes] = useState<Sobreposicao[]>(
    sobreposicoesIniciais,
  );
  const [carregando, setCarregando] = useState(false);

  const [salasSel, setSalasSel] = useState<Set<string>>(
    () => new Set(filtrosIniciais.salas ?? ativasIds),
  );
  const [statusSel, setStatusSel] = useState<Set<CategoriaStatus>>(
    () => new Set(filtrosIniciais.status ?? TODOS_STATUS),
  );
  const [responsavelSel, setResponsavelSel] = useState<string | null>(
    filtrosIniciais.responsavel,
  );

  const [selecionado, setSelecionado] = useState<AgendaItem | null>(null);
  const [removendo, setRemovendo] = useState(false);

  const [bloqueioAberto, setBloqueioAberto] = useState(false);
  const [bloqueioPrefill, setBloqueioPrefill] = useState<BloqueioPrefill>({
    data: "",
  });
  const [slotData, setSlotData] = useState<string | null>(null);

  const rangeAtual = useRef<{ inicio: string; fim: string } | null>(null);
  const reqId = useRef(0);

  const buscar = useCallback(async (inicioUtc: string, fimUtc: string) => {
    rangeAtual.current = { inicio: inicioUtc, fim: fimUtc };
    const id = ++reqId.current;
    setCarregando(true);
    const r = await listarAgenda({ inicio: inicioUtc, fim: fimUtc });
    if (id !== reqId.current) return; // resposta obsoleta
    setCarregando(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setEventos(r.eventos ?? []);
    setSobreposicoes(r.sobreposicoes ?? []);
  }, []);

  // Revalida no foco da janela (§8), sem Realtime.
  useEffect(() => {
    function aoFocar() {
      const r = rangeAtual.current;
      if (r) buscar(r.inicio, r.fim);
    }
    window.addEventListener("focus", aoFocar);
    return () => window.removeEventListener("focus", aoFocar);
  }, [buscar]);

  // Sincroniza os filtros com a URL (link compartilhável), sem re-render server.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);

    if (salasSel.size !== salas.length) {
      params.set("salas", [...salasSel].join(","));
    } else {
      params.delete("salas");
    }
    if (statusSel.size !== TODOS_STATUS.length) {
      params.set("status", [...statusSel].join(","));
    } else {
      params.delete("status");
    }
    if (responsavelSel) params.set("resp", responsavelSel);
    else params.delete("resp");

    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
  }, [salasSel, statusSel, responsavelSel, salas.length]);

  const responsaveis = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const e of eventos) {
      if (e.responsavelId && e.responsavelNome) {
        mapa.set(e.responsavelId, e.responsavelNome);
      }
    }
    return [...mapa.entries()].map(([id, nome]) => ({ id, nome }));
  }, [eventos]);

  const itensFiltrados = useMemo(
    () =>
      eventos.filter((it) => {
        if (!salasSel.has(it.salaId)) return false;
        if (!statusSel.has(categoriaDoItem(it))) return false;
        if (responsavelSel && it.responsavelId !== responsavelSel) return false;
        return true;
      }),
    [eventos, salasSel, statusSel, responsavelSel],
  );

  const idsConflito = useMemo(
    () => idsEmConflito(sobreposicoes),
    [sobreposicoes],
  );

  const contadores = useMemo(
    () => ({
      locacoes: eventos.filter((e) => e.origem === "locacao").length,
      pendentes: eventos.filter(ehPendente).length,
      eventos: eventos.filter((e) => e.origem === "evento_interno").length,
    }),
    [eventos],
  );

  function abrirNovoBloqueio() {
    setBloqueioPrefill({ data: hojeSaoPaulo(), diaInteiro: false });
    setBloqueioAberto(true);
  }

  async function onRemoverBloqueio(agendaId: string) {
    setRemovendo(true);
    const r = await removerBloqueio(agendaId);
    setRemovendo(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success("Bloqueio removido.");
    setSelecionado(null);
    const range = rangeAtual.current;
    if (range) buscar(range.inicio, range.fim);
  }

  function aoConcluirBloqueio() {
    const range = rangeAtual.current;
    if (range) buscar(range.inicio, range.fim);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <Filtros
        salas={salas}
        salasSel={salasSel}
        aoAlternarSala={(id) =>
          setSalasSel((prev) => {
            const p = new Set(prev);
            if (p.has(id)) p.delete(id);
            else p.add(id);
            return p;
          })
        }
        aoTodasSalas={() => setSalasSel(new Set(salas.map((s) => s.id)))}
        aoLimparSalas={() => setSalasSel(new Set())}
        statusSel={statusSel}
        aoAlternarStatus={(c) =>
          setStatusSel((prev) => {
            const p = new Set(prev);
            if (p.has(c)) p.delete(c);
            else p.add(c);
            return p;
          })
        }
        responsaveis={responsaveis}
        responsavelSel={responsavelSel}
        aoResponsavel={setResponsavelSel}
        contadores={contadores}
        aoNovoBloqueio={abrirNovoBloqueio}
      />

      <SobreposicoesPainel sobreposicoes={sobreposicoes} />

      <div className="relative">
        {carregando ? (
          <div className="pointer-events-none absolute right-2 top-2 z-10 rounded-full bg-brand/90 px-2 py-0.5 text-xs text-brand-foreground">
            Atualizando…
          </div>
        ) : null}
        <AgendaGrid
          itens={itensFiltrados}
          idsConflito={idsConflito}
          aoClicarEvento={setSelecionado}
          aoMudarRange={buscar}
          aoSelecionarSlot={setSlotData}
        />
      </div>

      <DetalheSheet
        item={selecionado}
        aoFechar={() => setSelecionado(null)}
        aoRemoverBloqueio={onRemoverBloqueio}
        removendo={removendo}
      />

      <BloqueioDialog
        salas={salas}
        aberto={bloqueioAberto}
        aoAbrir={setBloqueioAberto}
        prefill={bloqueioPrefill}
        aoConcluir={aoConcluirBloqueio}
      />

      {/* Menu de slot vazio (§8): nova locação ou bloqueio no dia clicado */}
      <Dialog open={slotData !== null} onOpenChange={(o) => !o && setSlotData(null)}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>O que deseja fazer?</DialogTitle>
            <DialogDescription>
              {slotData
                ? new Date(`${slotData}T12:00:00`).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })
                : null}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Link
              href={`/admin/locacoes/nova?data=${slotData ?? ""}`}
              className={buttonVariants({ variant: "default" })}
            >
              Nova locação neste dia
            </Link>
            <Button
              variant="outline"
              onClick={() => {
                if (slotData) {
                  setBloqueioPrefill({ data: slotData, diaInteiro: true });
                  setBloqueioAberto(true);
                }
                setSlotData(null);
              }}
            >
              Bloquear horário
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
