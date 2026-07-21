"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { utcParaNaiveSP } from "@/lib/calendario/tempo";
import type { EventoDetalhe } from "@/lib/eventos/tipos";
import { partesDataHoraSympla, PRIORIDADES } from "@/lib/eventos/tipos";
import type { SymplaOpcao } from "./actions";
import { criarEventoAction, editarEventoAction } from "./actions";
import { SymplaSeletor } from "./sympla-seletor";

const selectClasses =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const timeClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function EventoForm({
  salas,
  evento,
  hoje,
  symplaConfigurado = false,
}: {
  salas: { id: string; nome: string }[];
  evento?: EventoDetalhe;
  hoje: string;
  symplaConfigurado?: boolean;
}) {
  const router = useRouter();
  const editando = Boolean(evento);

  const naiveInicio = evento ? utcParaNaiveSP(evento.inicioUtc) : "";
  const naiveFim = evento ? utcParaNaiveSP(evento.fimUtc) : "";

  const [titulo, setTitulo] = useState(evento?.titulo ?? "");
  const [descricao, setDescricao] = useState(evento?.descricao ?? "");
  const [salaId, setSalaId] = useState(evento?.salaId ?? salas[0]?.id ?? "");
  const [data, setData] = useState(naiveInicio.slice(0, 10));
  const [horaInicio, setHoraInicio] = useState(naiveInicio.slice(11, 16));
  const [horaFim, setHoraFim] = useState(naiveFim.slice(11, 16));
  const [prioridade, setPrioridade] = useState(evento?.prioridade ?? "media");
  const [repetir, setRepetir] = useState(false);
  const [repetirAte, setRepetirAte] = useState("");
  const [symplaSel, setSymplaSel] = useState<SymplaOpcao | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Ao escolher um evento do Sympla: replica nome, data e horários (§5).
  function aoEscolherSympla(op: SymplaOpcao | null) {
    setSymplaSel(op);
    if (!op) return;
    setTitulo(op.name);
    const ini = partesDataHoraSympla(op.startDate);
    const fim = partesDataHoraSympla(op.endDate);
    if (ini) {
      setData(ini.data);
      setHoraInicio(ini.hora);
    }
    // Só replica o fim quando é no mesmo dia (nosso evento é de dia único).
    if (fim && (!ini || fim.data === ini.data)) setHoraFim(fim.hora);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!data || !horaInicio || !horaFim) {
      toast.error("Preencha data e horários.");
      return;
    }
    setSalvando(true);
    const base = {
      titulo: titulo.trim(),
      descricao: descricao.trim() || undefined,
      salaId,
      data,
      horaInicio,
      horaFim,
      prioridade,
    };

    if (editando && evento) {
      const r = await editarEventoAction({ ...base, eventoId: evento.id });
      setSalvando(false);
      if (r.error) return toast.error(r.error);
      toast.success("Evento salvo.");
      router.refresh();
      return;
    }

    const r = await criarEventoAction({
      ...base,
      repetirSemanalAte:
        repetir && repetirAte && !symplaSel ? repetirAte : undefined,
      symplaEventId: symplaSel?.id,
      symplaUrl: symplaSel?.url ?? undefined,
    });
    setSalvando(false);
    if (r.error) return toast.error(r.error);
    if (r.conflitos && r.conflitos.length > 0) {
      toast.warning(
        `Criado, mas ${r.conflitos.length} ocorrência(s) em conflito foram ignoradas.`,
      );
    } else {
      toast.success("Evento criado.");
    }
    if (r.aviso) toast.warning(r.aviso);
    if (r.id) router.push(`/admin/eventos/${r.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {!editando && symplaConfigurado ? (
        <div className="flex flex-col gap-2 rounded-lg border border-brand/20 bg-brand/5 p-3">
          <Label>Vincular a um evento do Sympla (opcional)</Label>
          <SymplaSeletor onSelecionar={aoEscolherSympla} valorId={symplaSel?.id} />
          {symplaSel ? (
            <p className="text-xs text-ink-muted">
              Preenchido a partir de <strong>{symplaSel.name}</strong>. Você pode
              ajustar sala e prioridade abaixo.{" "}
              <button
                type="button"
                className="text-brand hover:underline"
                onClick={() => setSymplaSel(null)}
              >
                Remover vínculo
              </button>
            </p>
          ) : (
            <p className="text-xs text-ink-muted">
              Ao escolher, nome, data e horário são preenchidos automaticamente.
            </p>
          )}
        </div>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ev-titulo">Título</Label>
        <Input
          id="ev-titulo"
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ex.: Palestra de vendas"
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="ev-descricao">Descrição (opcional)</Label>
        <textarea
          id="ev-descricao"
          rows={2}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          className="min-h-16 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ev-sala">Sala</Label>
          <select
            id="ev-sala"
            className={selectClasses}
            value={salaId}
            onChange={(e) => setSalaId(e.target.value)}
          >
            {salas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ev-prioridade">Prioridade</Label>
          <select
            id="ev-prioridade"
            className={selectClasses}
            value={prioridade}
            onChange={(e) =>
              setPrioridade(e.target.value as EventoDetalhe["prioridade"])
            }
          >
            {PRIORIDADES.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.rotulo} — {p.nota}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ev-data">Data</Label>
          <DatePicker id="ev-data" value={data} onChange={setData} dataMin={hoje} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ev-inicio">Início</Label>
          <input
            id="ev-inicio"
            type="time"
            className={timeClasses}
            value={horaInicio}
            onChange={(e) => setHoraInicio(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="ev-fim">Fim</Label>
          <input
            id="ev-fim"
            type="time"
            className={timeClasses}
            value={horaFim}
            onChange={(e) => setHoraFim(e.target.value)}
          />
        </div>
      </div>

      {!editando && !symplaSel ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={repetir}
              onChange={(e) => setRepetir(e.target.checked)}
            />
            Repetir semanalmente
          </label>
          {repetir ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ev-repetir">Até a data</Label>
              <DatePicker
                id="ev-repetir"
                value={repetirAte}
                onChange={setRepetirAte}
                dataMin={data || hoje}
              />
              <p className="text-xs text-ink-muted">
                Cria uma ocorrência por semana (independentes). Conflitos são
                ignorados e reportados.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" loading={salvando}>
          {editando ? "Salvar" : "Criar evento"}
        </Button>
      </div>
    </form>
  );
}
