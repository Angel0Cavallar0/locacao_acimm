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
import { rotuloFaixa } from "@/lib/coffee/faixas-core";
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

interface LinhaItem {
  item: string;
  qtd: string;
  unidade: string;
}
interface LinhaFaixa {
  de: string;
  ate: string;
  valor: string;
}
interface LinhaAdic {
  descricao: string;
  valor: string;
}

function adicionaisParaLinhas(nivel?: NivelCoffee): LinhaAdic[] {
  return (nivel?.adicionais ?? []).map((a) => ({
    descricao: a.descricao,
    valor: (a.valorCentavos / 100).toFixed(2).replace(".", ","),
  }));
}

function itensParaLinhas(nivel?: NivelCoffee): LinhaItem[] {
  return (nivel?.composicao ?? []).map((c) => ({
    item: c.item,
    qtd: String(c.qtd).replace(".", ","),
    unidade: c.unidade,
  }));
}

function faixasParaLinhas(nivel?: NivelCoffee): LinhaFaixa[] {
  const fs = nivel?.faixas ?? [];
  if (fs.length === 0) return [{ de: "1", ate: "", valor: "" }];
  return fs.map((f) => ({
    de: String(f.minPessoas),
    ate: f.maxPessoas === null ? "" : String(f.maxPessoas),
    valor: (f.valorPessoaCentavos / 100).toFixed(2).replace(".", ","),
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
  const [descricao, setDescricao] = useState(nivel?.descricao ?? "");
  const [ativo, setAtivo] = useState(nivel?.ativo ?? true);
  const [faixas, setFaixas] = useState<LinhaFaixa[]>(faixasParaLinhas(nivel));
  const [itens, setItens] = useState<LinhaItem[]>(itensParaLinhas(nivel));
  const [adicionais, setAdicionais] = useState<LinhaAdic[]>(
    adicionaisParaLinhas(nivel),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function setFaixa(i: number, patch: Partial<LinhaFaixa>) {
    setFaixas((fs) => fs.map((f, j) => (j === i ? { ...f, ...patch } : f)));
  }
  function setItem(i: number, patch: Partial<LinhaItem>) {
    setItens((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }
  function setAdic(i: number, patch: Partial<LinhaAdic>) {
    setAdicionais((as) => as.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    const payload = {
      nome: nome.trim(),
      descricao: descricao.trim(),
      ativo,
      faixasPreco: faixas
        .filter((f) => f.de.trim() !== "" || f.valor.trim() !== "")
        .map((f) => ({
          minPessoas: Number(f.de.replace(",", ".")) || 1,
          maxPessoas: f.ate.trim() === "" ? null : Number(f.ate.replace(",", ".")),
          valorPessoaCentavos: brlParaCentavos(f.valor),
        })),
      composicao: itens
        .filter((l) => l.item.trim())
        .map((l) => ({
          item: l.item.trim(),
          qtd: Number(l.qtd.replace(",", ".")) || 0,
          unidade: l.unidade.trim() || "un",
        })),
      adicionais: adicionais
        .filter((a) => a.descricao.trim())
        .map((a) => ({
          descricao: a.descricao.trim(),
          valorCentavos: brlParaCentavos(a.valor),
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{nivel ? "Editar" : "Novo"} nível de coffee</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={onSubmit}
          className="flex max-h-[70vh] min-w-0 flex-col gap-4 overflow-x-hidden overflow-y-auto"
          noValidate
        >
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
            <Label htmlFor="nv-desc">Descrição (o que tem no coffee)</Label>
            <textarea
              id="nv-desc"
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Café, sucos, mini salgados, bolo…"
              className="min-h-16 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          {/* Faixas de preço */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Preço por faixa de pessoas</Label>
              <span className="text-xs text-ink-muted">valor por pessoa</span>
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-2 text-xs text-ink-muted">
              <span>De (pessoas)</span>
              <span>Até (vazio = sem limite)</span>
              <span>Valor/pessoa (R$)</span>
              <span />
            </div>
            {faixas.map((f, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: linhas efêmeras
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.3fr)_auto] gap-2">
                <Input
                  inputMode="numeric"
                  value={f.de}
                  onChange={(e) => setFaixa(i, { de: e.target.value })}
                  placeholder="8"
                />
                <Input
                  inputMode="numeric"
                  value={f.ate}
                  onChange={(e) => setFaixa(i, { ate: e.target.value })}
                  placeholder="14"
                />
                <Input
                  inputMode="decimal"
                  value={f.valor}
                  onChange={(e) => setFaixa(i, { valor: e.target.value })}
                  placeholder="0,00"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remover faixa"
                  onClick={() => setFaixas((fs) => fs.filter((_, j) => j !== i))}
                >
                  <X className="size-4" />
                </Button>
              </div>
            ))}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setFaixas((fs) => [...fs, { de: "", ate: "", valor: "" }])
                }
              >
                <Plus className="size-4" />
                Adicionar faixa
              </Button>
            </div>
          </div>

          {/* Itens (compras) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Itens (quantidade por pedido)</Label>
              <span className="text-xs text-ink-muted">base da lista de compras</span>
            </div>
            {itens.length === 0 ? (
              <p className="text-xs text-ink-muted">
                Nenhum item — adicione o que compõe este nível (opcional).
              </p>
            ) : (
              itens.map((l, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: linhas efêmeras
                <div key={i} className="flex gap-2">
                  <Input
                    value={l.item}
                    onChange={(e) => setItem(i, { item: e.target.value })}
                    placeholder="Item (ex.: Mini salgado)"
                    className="min-w-0 flex-1"
                  />
                  <Input
                    value={l.qtd}
                    inputMode="decimal"
                    onChange={(e) => setItem(i, { qtd: e.target.value })}
                    placeholder="Qtd"
                    className="w-20"
                  />
                  <Input
                    value={l.unidade}
                    onChange={(e) => setItem(i, { unidade: e.target.value })}
                    placeholder="un"
                    className="w-20"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remover item"
                    onClick={() => setItens((ls) => ls.filter((_, j) => j !== i))}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setItens((ls) => [...ls, { item: "", qtd: "1", unidade: "un" }])
                }
              >
                <Plus className="size-4" />
                Adicionar item
              </Button>
            </div>
          </div>

          {/* Adicionais opcionais (catálogo) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label>Adicionais opcionais</Label>
              <span className="text-xs text-ink-muted">
                valor fixo por item · escolhidos na reserva
              </span>
            </div>
            {adicionais.length === 0 ? (
              <p className="text-xs text-ink-muted">
                Nenhum adicional — extras que a atendente pode incluir na reserva.
              </p>
            ) : (
              adicionais.map((a, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: linhas efêmeras
                <div key={i} className="flex gap-2">
                  <Input
                    value={a.descricao}
                    onChange={(e) => setAdic(i, { descricao: e.target.value })}
                    placeholder="Adicional (ex.: Brigadeiro)"
                    className="min-w-0 flex-1"
                  />
                  <Input
                    value={a.valor}
                    inputMode="decimal"
                    onChange={(e) => setAdic(i, { valor: e.target.value })}
                    placeholder="0,00"
                    className="w-28"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remover adicional"
                    onClick={() =>
                      setAdicionais((as) => as.filter((_, j) => j !== i))
                    }
                  >
                    <X className="size-4" />
                  </Button>
                </div>
              ))
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setAdicionais((as) => [...as, { descricao: "", valor: "" }])
                }
              >
                <Plus className="size-4" />
                Adicionar adicional
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

function resumoFaixas(nivel: NivelCoffee): string {
  if (nivel.faixas.length === 0) return "sem preço";
  return nivel.faixas
    .map(
      (f) => `${rotuloFaixa(f)}: ${centavosParaBRL(f.valorPessoaCentavos)}/pessoa`,
    )
    .join(" · ");
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
            Descrição, preço por faixa de pessoas e itens de compra.
          </p>
        </div>
        <Button onClick={() => setNovoAberto(true)}>
          <Plus className="size-4" />
          Novo nível
        </Button>
      </div>

      <p className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-ink-muted">
        Alterar o preço de um nível afeta apenas locações novas ou recalculadas.
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
                  {nivel.descricao ? (
                    <p className="mt-0.5 line-clamp-1 text-xs text-ink-muted">
                      {nivel.descricao}
                    </p>
                  ) : null}
                  <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-ink-muted">
                    <span>{resumoFaixas(nivel)}</span>
                    <span>{nivel.composicao.length} item(ns)</span>
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
