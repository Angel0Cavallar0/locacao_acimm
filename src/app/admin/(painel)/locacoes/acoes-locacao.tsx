"use client";

import { CalendarClock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { intervaloSP } from "@/lib/calendario/tempo";
import type { PeriodoDia } from "@/lib/dominio";
import {
  ACOES_POR_STATUS,
  podeReagendar,
  type StatusLocacao,
} from "@/lib/locacoes/maquina-estados-core";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { transicionar } from "./actions";
import { ReagendarDialog } from "./reagendar-dialog";

export function AcoesLocacao({
  locacao,
  salasDisponiveis,
}: {
  locacao: {
    id: string;
    status: StatusLocacao;
    inicioUtc: string;
    fimUtc: string;
    periodo: PeriodoDia | null;
    valorTotalCentavos: number;
    salas: { salaId: string; nome: string }[];
  };
  salasDisponiveis: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [motivoDialog, setMotivoDialog] = useState<{
    para: StatusLocacao;
    rotulo: string;
  } | null>(null);
  const [motivo, setMotivo] = useState("");
  const [aprovarAberto, setAprovarAberto] = useState(false);
  const [reagendarAberto, setReagendarAberto] = useState(false);

  const acoes = ACOES_POR_STATUS[locacao.status];

  function executa(
    para: StatusLocacao,
    opts?: { motivo?: string },
  ) {
    iniciar(async () => {
      const r = await transicionar({
        locacaoId: locacao.id,
        para,
        motivo: opts?.motivo,
      });
      if (r.error) {
        toast.error(r.error);
        return;
      }
      toast.success("Status atualizado.");
      setMotivoDialog(null);
      setAprovarAberto(false);
      setMotivo("");
      router.refresh();
    });
  }

  const variante = (v: "default" | "outline" | "destructive") => v;

  if (acoes.length === 0 && !podeReagendar(locacao.status)) {
    return (
      <p className="text-sm text-ink-muted">
        Locação em estado final — sem ações disponíveis.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {acoes.map((a) => (
          <Button
            key={a.para}
            variant={variante(a.variante)}
            size="sm"
            disabled={pendente}
            onClick={() => {
              if (a.tipo === "aprovar") setAprovarAberto(true);
              else if (a.tipo === "motivo")
                setMotivoDialog({ para: a.para, rotulo: a.rotulo });
              else executa(a.para);
            }}
          >
            {a.rotulo}
          </Button>
        ))}
        {podeReagendar(locacao.status) ? (
          <Button
            variant="outline"
            size="sm"
            disabled={pendente}
            onClick={() => setReagendarAberto(true)}
          >
            <CalendarClock className="size-4" />
            Reagendar
          </Button>
        ) : null}
      </div>

      {/* Confirmação de aprovação com resumo */}
      <Dialog open={aprovarAberto} onOpenChange={setAprovarAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprovar locação?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-ink-muted">Sala(s)</span>
              <span className="text-right text-ink">
                {locacao.salas.map((s) => s.nome).join(", ")}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-ink-muted">Horário</span>
              <span className="text-ink">
                {intervaloSP(locacao.inicioUtc, locacao.fimUtc)}
              </span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-ink-muted">Valor total</span>
              <span className="font-medium text-ink">
                {centavosParaBRL(locacao.valorTotalCentavos)}
              </span>
            </div>
            <p className="mt-2 text-xs text-ink-muted">
              A aprovação reserva a sala na agenda. Se o horário já estiver
              ocupado, a ação é bloqueada.
            </p>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancelar
            </DialogClose>
            <Button disabled={pendente} onClick={() => executa("aprovada")}>
              {pendente ? "Aprovando…" : "Aprovar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Motivo obrigatório (recusar/cancelar) */}
      <Dialog
        open={motivoDialog !== null}
        onOpenChange={(o) => {
          if (!o) {
            setMotivoDialog(null);
            setMotivo("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{motivoDialog?.rotulo} locação</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="motivo">Motivo (obrigatório)</Label>
            <textarea
              id="motivo"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="min-h-20 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Explique o motivo — aparece na linha do tempo."
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Voltar
            </DialogClose>
            <Button
              variant="destructive"
              disabled={pendente || motivo.trim().length === 0}
              onClick={() =>
                motivoDialog &&
                executa(motivoDialog.para, { motivo: motivo.trim() })
              }
            >
              {pendente ? "Salvando…" : `Confirmar ${motivoDialog?.rotulo.toLowerCase()}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReagendarDialog
        aberto={reagendarAberto}
        aoAbrir={setReagendarAberto}
        locacao={{
          id: locacao.id,
          inicioUtc: locacao.inicioUtc,
          fimUtc: locacao.fimUtc,
          periodo: locacao.periodo,
          salaIds: locacao.salas.map((s) => s.salaId),
        }}
        salasDisponiveis={salasDisponiveis}
      />
    </>
  );
}
