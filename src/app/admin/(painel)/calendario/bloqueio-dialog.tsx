"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarBloqueio } from "./actions";

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export interface BloqueioPrefill {
  salaId?: string;
  data: string;
  horaInicio?: string;
  horaFim?: string;
  diaInteiro?: boolean;
}

export function BloqueioDialog({
  salas,
  aberto,
  aoAbrir,
  prefill,
  aoConcluir,
}: {
  salas: { id: string; nome: string }[];
  aberto: boolean;
  aoAbrir: (open: boolean) => void;
  prefill: BloqueioPrefill;
  aoConcluir: () => void;
}) {
  const [salaId, setSalaId] = useState("");
  const [data, setData] = useState("");
  const [diaInteiro, setDiaInteiro] = useState(false);
  const [horaInicio, setHoraInicio] = useState("08:00");
  const [horaFim, setHoraFim] = useState("12:00");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Ao (re)abrir, semeia o formulário com o prefill (dia/hora do slot clicado).
  useEffect(() => {
    if (!aberto) return;
    setSalaId(prefill.salaId ?? salas[0]?.id ?? "");
    setData(prefill.data);
    setDiaInteiro(prefill.diaInteiro ?? false);
    setHoraInicio(prefill.horaInicio ?? "08:00");
    setHoraFim(prefill.horaFim ?? "12:00");
    setMotivo("");
    setErro(null);
  }, [aberto, prefill, salas]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    const r = await criarBloqueio({
      salaId,
      data,
      diaInteiro,
      horaInicio: diaInteiro ? undefined : horaInicio,
      horaFim: diaInteiro ? undefined : horaFim,
      motivo: motivo.trim(),
    });
    if (r.error) {
      setErro(r.error);
      setSalvando(false);
      return;
    }
    setSalvando(false);
    toast.success("Bloqueio criado.");
    aoAbrir(false);
    aoConcluir();
  }

  return (
    <Dialog open={aberto} onOpenChange={aoAbrir}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo bloqueio</DialogTitle>
          <DialogDescription>
            Reserva a sala manualmente (ex.: manutenção). Bloqueia a agenda no
            período informado.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bloq-sala">Sala</Label>
            <select
              id="bloq-sala"
              className={inputClasses}
              value={salaId}
              onChange={(e) => setSalaId(e.target.value)}
              required
            >
              {salas.length === 0 ? <option value="">—</option> : null}
              {salas.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bloq-data">Data</Label>
              <Input
                id="bloq-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
              />
            </div>
            <label className="mt-6 flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                className="size-4"
                checked={diaInteiro}
                onChange={(e) => setDiaInteiro(e.target.checked)}
              />
              Dia inteiro
            </label>
          </div>

          {!diaInteiro ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bloq-ini">Início</Label>
                <Input
                  id="bloq-ini"
                  type="time"
                  value={horaInicio}
                  onChange={(e) => setHoraInicio(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bloq-fim">Fim</Label>
                <Input
                  id="bloq-fim"
                  type="time"
                  value={horaFim}
                  onChange={(e) => setHoraFim(e.target.value)}
                />
              </div>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bloq-motivo">Motivo</Label>
            <Input
              id="bloq-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: Manutenção do ar-condicionado"
              maxLength={300}
              required
            />
          </div>

          {erro ? (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={salvando || !salaId}>
              {salvando ? "Criando…" : "Criar bloqueio"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
