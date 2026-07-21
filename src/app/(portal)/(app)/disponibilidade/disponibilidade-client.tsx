"use client";

import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ImageIcon,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { ChipAcaoDialog } from "@/components/disponibilidade/chip-acao-dialog";
import { ChipPeriodoButton } from "@/components/disponibilidade/chip-periodo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type {
  ChipPeriodo,
  DisponibilidadeDia,
  SalaDisponibilidade,
} from "@/lib/disponibilidade/tipos";
import { somarDias } from "@/lib/disponibilidade/janela";
import { cn } from "@/lib/utils";
import { listarDisponibilidadeAction } from "./actions";

interface SalaFiltro {
  id: string;
  nome: string;
  capacidade: number;
}

const CAP_OPCOES = [0, 10, 20, 30, 50, 100];

/** Carrossel de fotos da sala. */
function CarrosselFotos({ fotos, nome }: { fotos: string[]; nome: string }) {
  const [idx, setIdx] = useState(0);
  const n = fotos.length;
  const irPara = (i: number) => setIdx(((i % n) + n) % n);

  return (
    <div className="flex flex-col gap-2">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-surface-muted">
        {n > 0 ? (
          // biome-ignore lint/a11y/useAltText: alt fornecido
          <img
            key={fotos[idx]}
            src={fotos[idx]}
            alt={`Foto ${idx + 1} de ${nome}`}
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-ink-muted">
            <ImageIcon className="size-8" />
          </div>
        )}

        {n > 1 ? (
          <>
            <button
              type="button"
              aria-label="Foto anterior"
              onClick={() => irPara(idx - 1)}
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white transition-colors hover:bg-black/60"
            >
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              aria-label="Próxima foto"
              onClick={() => irPara(idx + 1)}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white transition-colors hover:bg-black/60"
            >
              <ChevronRight className="size-5" />
            </button>
            <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
              {fotos.map((f, i) => (
                <button
                  key={f}
                  type="button"
                  aria-label={`Ir para a foto ${i + 1}`}
                  onClick={() => setIdx(i)}
                  className={cn(
                    "h-1.5 rounded-full bg-white/60 transition-all",
                    i === idx ? "w-4 bg-white" : "w-1.5",
                  )}
                />
              ))}
            </div>
          </>
        ) : null}
      </div>
      {n > 1 ? (
        <p className="text-center text-xs text-ink-muted">
          {idx + 1} / {n}
        </p>
      ) : null}
    </div>
  );
}

/** Dialog com as informações completas da sala (layout duas colunas + carrossel). */
function SalaDetalheDialog({
  sala,
  aoFechar,
}: {
  sala: SalaDisponibilidade;
  aoFechar: () => void;
}) {
  const itens = [`${sala.capacidade} lugares`, ...sala.equipamentos];

  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="max-h-[88vh] w-full overflow-y-auto pt-10 sm:max-w-3xl">
        <div className="grid gap-6 md:grid-cols-2 md:items-center">
          {/* Carrossel (à direita no desktop, no topo no mobile) */}
          <div className="md:order-2">
            <CarrosselFotos fotos={sala.fotos} nome={sala.nome} />
          </div>

          {/* Informações */}
          <div className="flex flex-col gap-3 md:order-1">
            <span className="text-xs font-semibold tracking-wide text-brand uppercase">
              Ambiente ACIMM
            </span>
            <DialogTitle className="font-display text-2xl font-semibold text-ink">
              {sala.nome}
            </DialogTitle>
            {sala.descricao ? (
              <p className="whitespace-pre-line text-sm text-ink-muted">
                {sala.descricao}
              </p>
            ) : null}
            <ul className="flex flex-col gap-2">
              {itens.map((it) => (
                <li key={it} className="flex items-center gap-2 text-sm text-ink">
                  <CheckCircle2 className="size-4 shrink-0 text-brand" />
                  {it}
                </li>
              ))}
            </ul>

            {sala.diasAntecedenciaMinima > 0 ? (
              <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
                <Clock className="mt-0.5 size-4 shrink-0" />
                <p>
                  Reservas desta sala precisam de{" "}
                  <strong>{sala.diasAntecedenciaMinima}</strong>{" "}
                  {sala.diasAntecedenciaMinima === 1 ? "dia" : "dias"} de
                  antecedência.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function DisponibilidadeClient({
  inicial,
  todasSalas,
  hoje,
  dataMax,
  filtroInicial,
  prefill,
}: {
  inicial: DisponibilidadeDia;
  todasSalas: SalaFiltro[];
  hoje: string;
  dataMax: string;
  filtroInicial: { salaIds: string[]; cap: number };
  prefill: { nome: string; contato: string };
}) {
  const router = useRouter();
  const [data, setData] = useState(inicial.data);
  const [salaIds, setSalaIds] = useState<string[]>(filtroInicial.salaIds);
  const [cap, setCap] = useState<number>(filtroInicial.cap);
  const [dados, setDados] = useState<DisponibilidadeDia>(inicial);
  const [carregando, setCarregando] = useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [sel, setSel] = useState<{
    sala: SalaDisponibilidade;
    chip: ChipPeriodo;
  } | null>(null);
  const [detalhe, setDetalhe] = useState<SalaDisponibilidade | null>(null);
  const primeira = useRef(true);

  // Refetch + sincroniza a URL a cada mudança de data/filtros.
  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    const params = new URLSearchParams();
    params.set("data", data);
    if (salaIds.length > 0) params.set("salas", salaIds.join(","));
    if (cap > 0) params.set("cap", String(cap));
    window.history.replaceState(null, "", `/disponibilidade?${params}`);

    let ativo = true;
    setCarregando(true);
    listarDisponibilidadeAction({ data, salaIds, capacidadeMin: cap }).then(
      (r) => {
        if (!ativo) return;
        setCarregando(false);
        if ("error" in r) {
          toast.error(r.error);
          return;
        }
        setDados(r);
      },
    );
    return () => {
      ativo = false;
    };
  }, [data, salaIds, cap]);

  const noPassado = data <= hoje;
  const noFuturo = data >= dataMax;

  function clicarChip(sala: SalaDisponibilidade, chip: ChipPeriodo) {
    if (chip.estado === "sem_preco") return;
    if (chip.estado === "livre") {
      if (!dados.podeSolicitar) return;
      router.push(
        `/locacoes/nova?sala=${sala.id}&data=${data}&periodo=${chip.periodo}`,
      );
      return;
    }
    setSel({ sala, chip });
  }

  function toggleSala(id: string) {
    setSalaIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          Disponibilidade
        </h2>
        <p className="text-sm text-ink-muted">
          Consulte os horários livres por sala e solicite sua locação.
        </p>
      </div>

      {/* Seletor de data */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Dia anterior"
              disabled={noPassado}
              onClick={() => setData((d) => somarDias(d, -1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <div className="flex-1">
              <DatePicker
                value={data}
                onChange={setData}
                dataMin={hoje}
                dataMax={dataMax}
              />
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              aria-label="Próximo dia"
              disabled={noFuturo}
              onClick={() => setData((d) => somarDias(d, 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setFiltrosAbertos((f) => !f)}
            className="flex items-center gap-1.5 self-start text-sm text-ink-muted hover:text-ink"
          >
            <SlidersHorizontal className="size-3.5" />
            Filtros
            {salaIds.length > 0 || cap > 0 ? (
              <span className="rounded-full bg-brand/10 px-1.5 text-xs text-brand">
                {salaIds.length + (cap > 0 ? 1 : 0)}
              </span>
            ) : null}
          </button>

          {filtrosAbertos ? (
            <div className="flex flex-col gap-3 border-t pt-3">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-ink-muted">Salas</span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSalaIds([])}
                    className={cn(
                      "rounded-full border px-3 py-1 text-xs",
                      salaIds.length === 0
                        ? "border-brand bg-brand/10 text-brand"
                        : "text-ink-muted hover:text-ink",
                    )}
                  >
                    Todas
                  </button>
                  {todasSalas.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSala(s.id)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs",
                        salaIds.includes(s.id)
                          ? "border-brand bg-brand/10 text-brand"
                          : "text-ink-muted hover:text-ink",
                      )}
                    >
                      {s.nome}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cap">Capacidade mínima</Label>
                <select
                  id="cap"
                  value={cap}
                  onChange={(e) => setCap(Number(e.target.value))}
                  className="h-9 w-40 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {CAP_OPCOES.map((c) => (
                    <option key={c} value={c}>
                      {c === 0 ? "Qualquer" : `${c}+ pessoas`}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Cards de sala */}
      {dados.salas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-ink-muted">
            Nenhuma sala encontrada com esses filtros.
          </CardContent>
        </Card>
      ) : (
        <div
          className={cn(
            "grid gap-3 sm:grid-cols-2",
            carregando && "opacity-60",
          )}
        >
          {dados.salas.map((sala) => (
            <Card key={sala.id}>
              <CardContent className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => setDetalhe(sala)}
                  className="-m-1 flex gap-3 rounded-md p-1 text-left transition-colors hover:bg-surface-muted"
                  aria-label={`Ver informações de ${sala.nome}`}
                >
                  <div className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-muted text-ink-muted">
                    {sala.capaUrl ? (
                      // biome-ignore lint/a11y/useAltText: alt fornecido
                      <img
                        src={sala.capaUrl}
                        alt={sala.nome}
                        className="size-full object-cover"
                      />
                    ) : (
                      <ImageIcon className="size-5" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium text-ink">{sala.nome}</h3>
                    <p className="flex items-center gap-1 text-xs text-ink-muted">
                      <Users className="size-3" />
                      {sala.capacidade} lugares
                    </p>
                    {sala.equipamentos.length > 0 ? (
                      <p className="mt-0.5 truncate text-xs text-ink-muted">
                        {sala.equipamentos.slice(0, 2).join(", ")}
                        {sala.equipamentos.length > 2
                          ? ` +${sala.equipamentos.length - 2}`
                          : ""}
                      </p>
                    ) : null}
                    {sala.descricao ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-ink-muted">
                        {sala.descricao}
                      </p>
                    ) : null}
                  </div>
                </button>

                {sala.diasAntecedenciaMinima > 0 &&
                sala.chips.some((c) => c.estado === "antecedencia") ? (
                  <p className="inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                    <Clock className="size-3" />
                    Reserve com {sala.diasAntecedenciaMinima}{" "}
                    {sala.diasAntecedenciaMinima === 1 ? "dia" : "dias"} de
                    antecedência.
                  </p>
                ) : null}

                <div className="grid grid-cols-2 gap-1.5">
                  {sala.chips.map((chip) => (
                    <ChipPeriodoButton
                      key={chip.periodo}
                      chip={chip}
                      podeSolicitar={dados.podeSolicitar}
                      onClick={() => clicarChip(sala, chip)}
                    />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sel ? (
        <ChipAcaoDialog
          sala={sel.sala}
          chip={sel.chip}
          data={data}
          prefill={prefill}
          contato={dados.contato}
          podeSolicitar={dados.podeSolicitar}
          aoFechar={() => setSel(null)}
        />
      ) : null}

      {detalhe ? (
        <SalaDetalheDialog sala={detalhe} aoFechar={() => setDetalhe(null)} />
      ) : null}
    </div>
  );
}
