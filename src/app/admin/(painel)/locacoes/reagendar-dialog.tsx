"use client";

import { useRouter } from "next/navigation";
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
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { utcParaNaiveSP } from "@/lib/calendario/tempo";
import { PERIODOS, type PeriodoDia } from "@/lib/dominio";
import { reagendar } from "./actions";

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function ReagendarDialog({
  aberto,
  aoAbrir,
  locacao,
  salasDisponiveis,
}: {
  aberto: boolean;
  aoAbrir: (open: boolean) => void;
  locacao: {
    id: string;
    inicioUtc: string;
    fimUtc: string;
    periodo: PeriodoDia | null;
    salaIds: string[];
  };
  salasDisponiveis: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [data, setData] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");
  const [periodo, setPeriodo] = useState<PeriodoDia>("manha");
  const [salaIds, setSalaIds] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  // Sobreposição (Spec 31 §7): mensagem do ocupante a confirmar.
  const [conflito, setConflito] = useState<string | null>(null);

  useEffect(() => {
    if (!aberto) return;
    const ini = utcParaNaiveSP(locacao.inicioUtc);
    const fim = utcParaNaiveSP(locacao.fimUtc);
    setData(ini.slice(0, 10));
    setHoraInicio(ini.slice(11, 16));
    setHoraFim(fim.slice(11, 16));
    setPeriodo(locacao.periodo ?? "manha");
    setSalaIds(locacao.salaIds);
    setErro(null);
    setConflito(null);
  }, [aberto, locacao]);

  function toggleSala(id: string) {
    setSalaIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function salvar(sobrepor: boolean) {
    setErro(null);
    setSalvando(true);
    const r = await reagendar({
      locacaoId: locacao.id,
      data,
      horaInicio,
      horaFim,
      periodo,
      salaIds,
      sobreposicaoAutorizada: sobrepor,
    });
    setSalvando(false);
    if (r.conflitoSobreposicao) {
      setConflito(r.conflitoSobreposicao);
      return;
    }
    if (r.error) {
      setErro(r.error);
      return;
    }
    toast.success("Locação reagendada.");
    if (r.aviso) toast.warning(r.aviso);
    aoAbrir(false);
    router.refresh();
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    await salvar(false);
  }

  return (
    <Dialog open={aberto} onOpenChange={aoAbrir}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reagendar locação</DialogTitle>
          <DialogDescription>
            Os valores são recalculados no servidor a partir da tabela de preços
            vigente para a nova data/período.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reag-data">Data</Label>
              <DatePicker id="reag-data" value={data} onChange={setData} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reag-periodo">Período</Label>
              <select
                id="reag-periodo"
                className={inputClasses}
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value as PeriodoDia)}
              >
                {PERIODOS.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reag-ini">Início</Label>
              <Input
                id="reag-ini"
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="reag-fim">Fim</Label>
              <Input
                id="reag-fim"
                type="time"
                value={horaFim}
                onChange={(e) => setHoraFim(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Salas</Label>
            <div className="divide-y rounded-lg border">
              {salasDisponiveis.map((s) => (
                <label
                  key={s.id}
                  className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-ink"
                >
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={salaIds.includes(s.id)}
                    onChange={() => toggleSala(s.id)}
                  />
                  {s.nome}
                </label>
              ))}
            </div>
          </div>

          {erro ? (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          ) : null}

          {conflito ? (
            <div className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              <p className="font-medium">Horário ocupado</p>
              <p>{conflito}</p>
              <p className="mt-1 text-ink-muted">
                Confirme para reagendar sobrepondo esse horário (sobreposição
                autorizada).
              </p>
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancelar
            </DialogClose>
            {conflito ? (
              <Button
                type="button"
                loading={salvando}
                disabled={salaIds.length === 0}
                onClick={() => salvar(true)}
              >
                Confirmar sobreposição
              </Button>
            ) : (
              <Button
                type="submit"
                loading={salvando}
                disabled={salaIds.length === 0}
              >
                Reagendar
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
