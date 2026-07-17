"use client";

import { ChevronDown, ChevronUp, ImageIcon, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { SalaCard } from "./page";
import {
  alternarAtivaSala,
  type LocacaoFutura,
  locacoesFuturasDaSala,
  moverSala,
} from "./actions";

function DesativarDialog({
  sala,
  onConfirmar,
  pendente,
}: {
  sala: SalaCard;
  onConfirmar: () => void;
  pendente: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [futuras, setFuturas] = useState<LocacaoFutura[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [texto, setTexto] = useState("");

  const confere = texto.trim() === sala.nome.trim();

  async function abrir(aberto: boolean) {
    setOpen(aberto);
    if (!aberto) setTexto("");
    if (aberto && futuras === null) {
      setCarregando(true);
      const r = await locacoesFuturasDaSala(sala.id);
      setFuturas(r);
      setCarregando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={abrir}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => abrir(true)}
        className="bg-surface-muted text-ink-muted hover:bg-destructive/10 hover:text-destructive"
      >
        Desativar
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desativar “{sala.nome}”?</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-ink-muted">
          A sala sai de circulação (não recebe novas locações). Nada é
          cancelado e o histórico é preservado.
          {carregando ? (
            <p className="mt-3">Verificando locações futuras…</p>
          ) : futuras && futuras.length > 0 ? (
            <div className="mt-3">
              <p className="font-medium text-ink">
                Há {futuras.length} locação(ões) futura(s) confirmada(s):
              </p>
              <ul className="mt-1 list-disc pl-5">
                {futuras.map((l) => (
                  <li key={l.numero}>
                    LOC-{String(l.numero).padStart(6, "0")} — {l.locatario} (
                    {new Date(l.inicio).toLocaleDateString("pt-BR")})
                  </li>
                ))}
              </ul>
              <p className="mt-1">Elas seguem valendo normalmente.</p>
            </div>
          ) : (
            <p className="mt-3">Nenhuma locação futura confirmada.</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="conf-desativar">
            Digite <span className="font-medium text-ink">{sala.nome}</span> para
            confirmar
          </Label>
          <Input
            id="conf-desativar"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={sala.nome}
            autoComplete="off"
          />
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            Cancelar
          </DialogClose>
          <Button
            variant="destructive"
            disabled={pendente || !confere}
            onClick={() => {
              setOpen(false);
              setTexto("");
              onConfirmar();
            }}
          >
            Desativar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SalasLista({ salas }: { salas: SalaCard[] }) {
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function mover(id: string, direcao: "cima" | "baixo") {
    setPendingId(id);
    startTransition(async () => {
      const r = await moverSala(id, direcao);
      if (r.error) toast.error(r.error);
      setPendingId(null);
    });
  }

  function alternar(sala: SalaCard) {
    setPendingId(sala.id);
    startTransition(async () => {
      const r = await alternarAtivaSala(sala.id, !sala.ativa);
      if (r.error) toast.error(r.error);
      else toast.success(sala.ativa ? "Sala desativada." : "Sala ativada.");
      setPendingId(null);
    });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Salas</h2>
          <p className="text-sm text-ink-muted">
            Cadastre ambientes, fotos e a tabela de preços.
          </p>
        </div>
        <Link href="/admin/salas/nova" className={buttonVariants()}>
          <Plus className="size-4" />
          Nova sala
        </Link>
      </div>

      {salas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-ink-muted">
            Nenhuma sala cadastrada ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {salas.map((sala, i) => (
            <Card
              key={sala.id}
              className={cn(
                isPending && pendingId === sala.id && "opacity-60",
              )}
            >
              <CardContent className="flex items-center gap-4">
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label="Mover para cima"
                    disabled={i === 0 || isPending}
                    onClick={() => mover(sala.id, "cima")}
                    className="rounded p-0.5 text-ink-muted hover:bg-surface-muted disabled:opacity-30"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Mover para baixo"
                    disabled={i === salas.length - 1 || isPending}
                    onClick={() => mover(sala.id, "baixo")}
                    className="rounded p-0.5 text-ink-muted hover:bg-surface-muted disabled:opacity-30"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                </div>

                <Link
                  href={`/admin/salas/${sala.id}`}
                  className="flex min-w-0 flex-1 items-center gap-4"
                >
                  <div className="size-16 shrink-0 overflow-hidden rounded-md bg-surface-muted">
                    {sala.capaUrl ? (
                      // biome-ignore lint/a11y/useAltText: alt fornecido
                      <img
                        src={sala.capaUrl}
                        alt={sala.nome}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center text-ink-muted">
                        <ImageIcon className="size-5" />
                      </div>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-medium text-ink">
                        {sala.nome}
                      </h3>
                      <Badge variant={sala.ativa ? "default" : "outline"}>
                        {sala.ativa ? "Ativa" : "Indisponível"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-muted">
                      <span className="inline-flex items-center gap-1">
                        <Users className="size-3" />
                        {sala.capacidade} lugares
                      </span>
                      <span>{sala.precosVigentes} preços vigentes</span>
                      <span>{sala.totalFotos} fotos</span>
                    </p>
                  </div>
                </Link>

                <div className="flex shrink-0 items-center gap-1">
                  {sala.ativa ? (
                    <DesativarDialog
                      sala={sala}
                      pendente={isPending && pendingId === sala.id}
                      onConfirmar={() => alternar(sala)}
                    />
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isPending && pendingId === sala.id}
                      onClick={() => alternar(sala)}
                    >
                      Ativar
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
