"use client";

import {
  ChevronLeft,
  ChevronRight,
  ImageIcon,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type {
  ChipPeriodo,
  DisponibilidadeDia,
  SalaDisponibilidade,
} from "@/lib/disponibilidade/tipos";
import { somarDias } from "@/lib/disponibilidade/janela";
import { cn } from "@/lib/utils";
import { centavosParaBRL } from "@/lib/utils/moeda";
import {
  entrarFilaEspera,
  listarDisponibilidadeAction,
  statusFilaEspera,
} from "./actions";

interface SalaFiltro {
  id: string;
  nome: string;
  capacidade: number;
}

const CAP_OPCOES = [0, 10, 20, 30, 50, 100];

const CHIP_ESTILO: Record<ChipPeriodo["estado"], string> = {
  livre:
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20",
  solicitado:
    "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20",
  ocupado: "border-input bg-surface-muted text-ink-muted",
  evento_acimm:
    "border-brand/40 bg-brand/10 text-brand hover:bg-brand/20",
  sem_preco: "border-input bg-surface-muted text-ink-muted",
};

function rotuloEstado(chip: ChipPeriodo, podeSolicitar: boolean): string {
  switch (chip.estado) {
    case "livre":
      return podeSolicitar && chip.precoCentavos !== null
        ? centavosParaBRL(chip.precoCentavos)
        : "Livre";
    case "solicitado":
      return "Solicitado";
    case "ocupado":
      return "Indisponível";
    case "evento_acimm":
      return chip.eventoTitulo ?? "Evento ACIMM";
    case "sem_preco":
      return "Não disponível";
  }
}

function formatarData(iso: string): string {
  const [y, m, d] = iso.split("-");
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return dt.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "long",
  });
}

/** Dialog de ação por chip (fila de espera / convite de evento). */
function ChipDialog({
  sala,
  chip,
  data,
  prefill,
  contato,
  podeSolicitar,
  aoFechar,
}: {
  sala: SalaDisponibilidade;
  chip: ChipPeriodo;
  data: string;
  prefill: { nome: string; contato: string };
  contato: DisponibilidadeDia["contato"];
  podeSolicitar: boolean;
  aoFechar: () => void;
}) {
  const [nome, setNome] = useState(prefill.nome);
  const [contatoInput, setContatoInput] = useState(prefill.contato);
  const [jaNaFila, setJaNaFila] = useState(false);
  const [pessoasNaFrente, setPessoasNaFrente] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const ehEvento = chip.estado === "evento_acimm";

  useEffect(() => {
    if (ehEvento || !podeSolicitar) return;
    let ativo = true;
    statusFilaEspera(sala.id, data).then((s) => {
      if (!ativo) return;
      setJaNaFila(s.jaNaFila);
      setPessoasNaFrente(s.pessoasNaFrente);
    });
    return () => {
      ativo = false;
    };
  }, [ehEvento, podeSolicitar, sala.id, data]);

  async function entrar() {
    setEnviando(true);
    const r = await entrarFilaEspera({
      salaId: sala.id,
      data,
      nome: nome.trim(),
      contato: contatoInput.trim(),
    });
    setEnviando(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setJaNaFila(true);
    setPessoasNaFrente(r.pessoasNaFrente);
    toast.success(
      r.jaNaFila ? "Você já estava na fila." : "Você entrou na fila de espera.",
    );
  }

  const contatos = [contato.telefone, contato.whatsapp, contato.email].filter(
    Boolean,
  );

  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {sala.nome} · {chip.rotulo}
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-ink-muted">
          {formatarData(data)} · {chip.faixa.inicio}–{chip.faixa.fim}
        </p>

        {ehEvento ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink">
              Este horário está reservado para um evento da ACIMM. Que tal
              participar?
            </p>
            {chip.eventoTitulo ? (
              <p className="rounded-md bg-surface-muted px-3 py-2 text-sm font-medium text-ink">
                {chip.eventoTitulo}
              </p>
            ) : null}
            <div className="rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-xs text-ink-muted">
              Precisa desta sala especificamente nesta data? Fale com a equipe da
              ACIMM
              {contatos.length > 0 ? `: ${contatos.join(" · ")}` : "."}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink">
              {chip.estado === "solicitado"
                ? "Este horário já foi solicitado por outro associado e aguarda aprovação."
                : "Este horário já está reservado."}
            </p>

            {!podeSolicitar ? (
              <p className="text-sm text-ink-muted">
                Novas solicitações estão indisponíveis para a sua situação atual.
              </p>
            ) : jaNaFila ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-ink">
                Você já está na fila desta data.
                {pessoasNaFrente > 0
                  ? ` ${pessoasNaFrente} ${pessoasNaFrente === 1 ? "pessoa" : "pessoas"} à frente.`
                  : " Você é o próximo da fila."}
                <p className="mt-1 text-xs text-ink-muted">
                  A ACIMM entrará em contato se o horário for liberado.
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-ink-muted">
                  Entre na fila de espera — avisamos se o horário liberar.
                </p>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fila-nome">Nome</Label>
                  <Input
                    id="fila-nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="fila-contato">Contato (telefone/WhatsApp)</Label>
                  <Input
                    id="fila-contato"
                    value={contatoInput}
                    onChange={(e) => setContatoInput(e.target.value)}
                  />
                </div>
                <Button loading={enviando} onClick={entrar}>
                  Entrar na fila de espera
                </Button>
              </div>
            )}

            <button
              type="button"
              onClick={aoFechar}
              className="text-sm text-brand hover:underline"
            >
              Escolher outra data
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Dialog com as informações completas da sala (fotos, capacidade, itens). */
function SalaDetalheDialog({
  sala,
  aoFechar,
}: {
  sala: SalaDisponibilidade;
  aoFechar: () => void;
}) {
  const [fotoIdx, setFotoIdx] = useState(0);

  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{sala.nome}</DialogTitle>
        </DialogHeader>

        {sala.fotos.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-surface-muted">
              {/* biome-ignore lint/a11y/useAltText: alt fornecido */}
              <img
                src={sala.fotos[fotoIdx]}
                alt={`Foto de ${sala.nome}`}
                className="size-full object-cover"
              />
            </div>
            {sala.fotos.length > 1 ? (
              <div className="flex gap-1.5 overflow-x-auto">
                {sala.fotos.map((f, i) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFotoIdx(i)}
                    className={cn(
                      "size-12 shrink-0 overflow-hidden rounded border-2",
                      i === fotoIdx ? "border-brand" : "border-transparent",
                    )}
                  >
                    {/* biome-ignore lint/a11y/useAltText: decorativa */}
                    <img
                      src={f}
                      alt={`Foto ${i + 1} de ${sala.nome}`}
                      className="size-full object-cover"
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex items-center gap-1.5 text-sm text-ink">
          <Users className="size-4 text-ink-muted" />
          {sala.capacidade} lugares
        </div>

        {sala.equipamentos.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {sala.equipamentos.map((e) => (
              <span
                key={e}
                className="rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink-muted"
              >
                {e}
              </span>
            ))}
          </div>
        ) : null}

        {sala.descricao ? (
          <p className="whitespace-pre-line text-sm text-ink-muted">
            {sala.descricao}
          </p>
        ) : (
          <p className="text-sm text-ink-muted">Sem descrição cadastrada.</p>
        )}
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

                <div className="grid grid-cols-2 gap-1.5">
                  {sala.chips.map((chip) => {
                    const inerte =
                      chip.estado === "sem_preco" ||
                      (chip.estado === "livre" && !dados.podeSolicitar);
                    return (
                      <button
                        key={chip.periodo}
                        type="button"
                        disabled={inerte}
                        title={
                          chip.estado === "sem_preco"
                            ? "Período não disponível para locação"
                            : undefined
                        }
                        onClick={() => clicarChip(sala, chip)}
                        className={cn(
                          "flex flex-col items-start rounded-lg border px-2.5 py-1.5 text-left transition-colors",
                          CHIP_ESTILO[chip.estado],
                          inerte && "cursor-default",
                        )}
                      >
                        <span className="text-xs font-medium">{chip.rotulo}</span>
                        <span className="truncate text-xs">
                          {rotuloEstado(chip, dados.podeSolicitar)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {sel ? (
        <ChipDialog
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
