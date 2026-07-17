"use client";

import { ChevronDown, ChevronUp, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import type { NivelCoffee } from "@/lib/coffee/tipos";
import { cn } from "@/lib/utils";
import { brlParaCentavos, centavosParaBRL } from "@/lib/utils/moeda";
import {
  alternarAtivoNivel,
  atualizarNivel,
  criarNivel,
  moverNivel,
} from "./actions";

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

interface LinhaComposicao {
  item: string;
  qtd: string;
  unidade: string;
}

function paraLinhas(nivel?: NivelCoffee): LinhaComposicao[] {
  return (nivel?.composicao ?? []).map((c) => ({
    item: c.item,
    qtd: String(c.qtdPorPessoa).replace(".", ","),
    unidade: c.unidade,
  }));
}

function NivelDialog({
  nivel,
  aberto,
  aoAbrir,
}: {
  nivel?: NivelCoffee;
  aberto: boolean;
  aoAbrir: (o: boolean) => void;
}) {
  const router = useRouter();
  const [nome, setNome] = useState(nivel?.nome ?? "");
  const [valor, setValor] = useState(
    nivel ? (nivel.valorPessoaCentavos / 100).toFixed(2).replace(".", ",") : "",
  );
  const [ativo, setAtivo] = useState(nivel?.ativo ?? true);
  const [linhas, setLinhas] = useState<LinhaComposicao[]>(paraLinhas(nivel));
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function atualizarLinha(i: number, patch: Partial<LinhaComposicao>) {
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    const payload = {
      nome: nome.trim(),
      valorPessoaCentavos: brlParaCentavos(valor),
      ativo,
      composicao: linhas
        .filter((l) => l.item.trim())
        .map((l) => ({
          item: l.item.trim(),
          qtdPorPessoa: Number(l.qtd.replace(",", ".")) || 0,
          unidade: l.unidade.trim() || "un",
        })),
    };
    const r = nivel
      ? await atualizarNivel(nivel.id, payload)
      : await criarNivel(payload);
    setSalvando(false);
    if (r.error) {
      setErro(r.error);
      return;
    }
    toast.success(nivel ? "Nível salvo." : "Nível criado.");
    aoAbrir(false);
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={aoAbrir}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{nivel ? "Editar" : "Novo"} nível de coffee</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nv-nome">Nome</Label>
              <Input
                id="nv-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Bronze, Prata, Ouro…"
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nv-valor">Valor por pessoa (R$)</Label>
              <Input
                id="nv-valor"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Composição (por pessoa)</Label>
              <span className="text-xs text-ink-muted">
                base da lista de compras
              </span>
            </div>
            {linhas.length === 0 ? (
              <p className="text-xs text-ink-muted">
                Nenhum item — adicione o que compõe este nível.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {linhas.map((l, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: linhas efêmeras
                  <div key={i} className="flex gap-2">
                    <Input
                      value={l.item}
                      onChange={(e) => atualizarLinha(i, { item: e.target.value })}
                      placeholder="Item (ex.: Mini sanduíche)"
                    />
                    <Input
                      value={l.qtd}
                      inputMode="decimal"
                      onChange={(e) => atualizarLinha(i, { qtd: e.target.value })}
                      placeholder="Qtd"
                      className="w-20"
                    />
                    <Input
                      value={l.unidade}
                      onChange={(e) =>
                        atualizarLinha(i, { unidade: e.target.value })
                      }
                      placeholder="un"
                      className="w-20"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Remover item"
                      onClick={() =>
                        setLinhas((ls) => ls.filter((_, j) => j !== i))
                      }
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setLinhas((ls) => [...ls, { item: "", qtd: "1", unidade: "un" }])
                }
              >
                <Plus className="size-4" />
                Adicionar item
              </Button>
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
            />
            <span className="text-ink">Nível ativo (aparece em novas locações)</span>
          </label>

          {erro ? (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" loading={salvando}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function NiveisClient({ niveis }: { niveis: NivelCoffee[] }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [novoAberto, setNovoAberto] = useState(false);
  const [editando, setEditando] = useState<NivelCoffee | null>(null);

  function mover(id: string, direcao: "cima" | "baixo") {
    setPendingId(id);
    iniciar(async () => {
      const r = await moverNivel(id, direcao);
      if (r.error) toast.error(r.error);
      setPendingId(null);
    });
  }

  function alternar(nivel: NivelCoffee) {
    setPendingId(nivel.id);
    iniciar(async () => {
      const r = await alternarAtivoNivel(nivel.id, !nivel.ativo);
      if (r.error) toast.error(r.error);
      else toast.success(nivel.ativo ? "Nível desativado." : "Nível ativado.");
      setPendingId(null);
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Níveis de coffee
          </h2>
          <p className="text-sm text-ink-muted">
            Valor por pessoa e composição de cada nível.
          </p>
        </div>
        <Button onClick={() => setNovoAberto(true)}>
          <Plus className="size-4" />
          Novo nível
        </Button>
      </div>

      <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-ink-muted">
        Alterar o valor de um nível afeta apenas locações novas ou recalculadas.
        Locações já existentes mantêm o valor que foi calculado na época
        (snapshot) — nada é alterado retroativamente.
      </p>

      {niveis.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-ink-muted">
            Nenhum nível cadastrado. Crie o primeiro para habilitar o coffee nas
            locações.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {niveis.map((nivel, i) => (
            <Card
              key={nivel.id}
              className={cn(pendente && pendingId === nivel.id && "opacity-60")}
            >
              <CardContent className="flex items-center gap-4">
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label="Mover para cima"
                    disabled={i === 0 || pendente}
                    onClick={() => mover(nivel.id, "cima")}
                    className="rounded p-0.5 text-ink-muted hover:bg-surface-muted disabled:opacity-30"
                  >
                    <ChevronUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Mover para baixo"
                    disabled={i === niveis.length - 1 || pendente}
                    onClick={() => mover(nivel.id, "baixo")}
                    className="rounded p-0.5 text-ink-muted hover:bg-surface-muted disabled:opacity-30"
                  >
                    <ChevronDown className="size-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setEditando(nivel)}
                  className="flex min-w-0 flex-1 flex-col items-start text-left"
                >
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium text-ink">
                      {nivel.nome}
                    </h3>
                    <Badge variant={nivel.ativo ? "default" : "outline"}>
                      {nivel.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-muted">
                    <span>
                      {centavosParaBRL(nivel.valorPessoaCentavos)}/pessoa
                    </span>
                    <span>{nivel.composicao.length} item(ns) na composição</span>
                  </p>
                </button>

                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditando(nivel)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    loading={pendente && pendingId === nivel.id}
                    onClick={() => alternar(nivel)}
                  >
                    {nivel.ativo ? "Desativar" : "Ativar"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <NivelDialog aberto={novoAberto} aoAbrir={setNovoAberto} />
      {editando ? (
        <NivelDialog
          key={editando.id}
          nivel={editando}
          aberto={editando !== null}
          aoAbrir={(o) => !o && setEditando(null)}
        />
      ) : null}
    </div>
  );
}
