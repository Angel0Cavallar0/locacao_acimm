"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  entrarFilaEspera,
  statusFilaEspera,
} from "@/app/(portal)/(app)/disponibilidade/actions";
import { Button } from "@/components/ui/button";
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
  ContatoAcimm,
  SalaDisponibilidade,
} from "@/lib/disponibilidade/tipos";

/**
 * Dialog de ação por chip: fila de espera (horário solicitado/ocupado) ou
 * convite ao evento ACIMM (§8.3c). Fonte única compartilhada pela
 * disponibilidade (Spec 10) e pela etapa 1 da solicitação (Spec 11).
 */

function formatarData(iso: string): string {
  const [y, m, d] = iso.split("-");
  const dt = new Date(Number(y), Number(m) - 1, Number(d));
  return dt.toLocaleDateString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "long",
  });
}

export function ChipAcaoDialog({
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
  contato: ContatoAcimm;
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
            {chip.eventoSymplaUrl ? (
              <a
                href={chip.eventoSymplaUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand/90"
              >
                Participar do evento
              </a>
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
