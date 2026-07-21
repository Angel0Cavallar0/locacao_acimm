"use client";

import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { horaSP } from "@/lib/calendario/tempo";
import { valorPessoaDe } from "@/lib/coffee/faixas-core";
import type { AdicionalCoffee, FaixaPreco } from "@/lib/coffee/tipos";
import type { CoffeeLinha } from "@/lib/locacoes/tipos";
import { brlParaCentavos, centavosParaBRL } from "@/lib/utils/moeda";
import { removerCoffeeAction, salvarCoffeeAction } from "./actions";

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export interface NivelOpcao {
  id: string;
  nome: string;
  faixas: FaixaPreco[];
  adicionais: AdicionalCoffee[];
}

interface LinhaAdic {
  descricao: string;
  valor: string;
}

function CoffeeDialog({
  locacaoId,
  niveis,
  coffee,
  aberto,
  aoAbrir,
}: {
  locacaoId: string;
  niveis: NivelOpcao[];
  coffee?: CoffeeLinha;
  aberto: boolean;
  aoAbrir: (o: boolean) => void;
}) {
  const router = useRouter();

  // Se o nível do coffee em edição estiver inativo, garante a opção no select.
  const opcoes = useMemo(() => {
    if (coffee && !niveis.some((n) => n.id === coffee.nivelId)) {
      return [
        {
          id: coffee.nivelId,
          nome: `${coffee.nivelNome} (inativo)`,
          faixas: [],
          adicionais: [],
        },
        ...niveis,
      ];
    }
    return niveis;
  }, [coffee, niveis]);

  const [nivelId, setNivelId] = useState(
    coffee?.nivelId ?? niveis[0]?.id ?? "",
  );
  const [pessoas, setPessoas] = useState(
    coffee ? String(coffee.qtdPessoas) : "",
  );
  const [servir, setServir] = useState(
    coffee?.horarioServirUtc ? horaSP(coffee.horarioServirUtc) : "",
  );
  const [observacoes, setObservacoes] = useState(coffee?.observacoes ?? "");
  const [adicionais, setAdicionais] = useState<LinhaAdic[]>(
    (coffee?.adicionais ?? []).map((a) => ({
      descricao: a.descricao,
      valor: (a.valorCentavos / 100).toFixed(2).replace(".", ","),
    })),
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const nivelSel = opcoes.find((n) => n.id === nivelId);
  const faixasSel = nivelSel?.faixas ?? [];
  const catalogo = nivelSel?.adicionais ?? [];
  const qtdPessoas = Number(pessoas) || 0;
  const valorPessoa = valorPessoaDe(faixasSel, qtdPessoas);
  const adicionaisCentavos = adicionais.reduce(
    (s, a) => s + brlParaCentavos(a.valor),
    0,
  );
  const previa = valorPessoa * qtdPessoas + adicionaisCentavos;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    if (!nivelId) {
      setErro("Selecione o nível.");
      return;
    }
    setSalvando(true);
    const r = await salvarCoffeeAction({
      locacaoId,
      coffeeId: coffee?.id,
      nivelId,
      qtdPessoas: Number(pessoas) || 0,
      horarioServir: servir || undefined,
      adicionais: adicionais
        .filter((a) => a.descricao.trim())
        .map((a) => ({
          descricao: a.descricao.trim(),
          valorCentavos: brlParaCentavos(a.valor),
        })),
      observacoes: observacoes.trim(),
    });
    setSalvando(false);
    if (r.error) {
      setErro(r.error);
      return;
    }
    toast.success(coffee ? "Coffee salvo." : "Coffee incluído.");
    if (r.aviso) toast.warning(r.aviso);
    aoAbrir(false);
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={aoAbrir}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{coffee ? "Editar" : "Adicionar"} coffee break</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-nivel">Nível</Label>
              <select
                id="cf-nivel"
                className={inputClasses}
                value={nivelId}
                onChange={(e) => setNivelId(e.target.value)}
              >
                {opcoes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-pessoas">Pessoas</Label>
              <Input
                id="cf-pessoas"
                type="number"
                min={1}
                value={pessoas}
                onChange={(e) => setPessoas(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="cf-servir">Servir às</Label>
              <Input
                id="cf-servir"
                type="time"
                value={servir}
                onChange={(e) => setServir(e.target.value)}
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label>Adicionais do coffee</Label>
            {catalogo.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {catalogo.map((a) => (
                  <button
                    key={`${a.descricao}-${a.valorCentavos}`}
                    type="button"
                    onClick={() =>
                      setAdicionais((ls) => [
                        ...ls,
                        {
                          descricao: a.descricao,
                          valor: (a.valorCentavos / 100)
                            .toFixed(2)
                            .replace(".", ","),
                        },
                      ])
                    }
                    className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-ink-muted hover:border-brand hover:text-brand"
                  >
                    <Plus className="size-3" />
                    {a.descricao} · {centavosParaBRL(a.valorCentavos)}
                  </button>
                ))}
              </div>
            ) : null}
            {adicionais.map((a, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: linhas efêmeras
              <div key={i} className="flex gap-2">
                <Input
                  value={a.descricao}
                  onChange={(e) =>
                    setAdicionais((ls) =>
                      ls.map((l, j) =>
                        j === i ? { ...l, descricao: e.target.value } : l,
                      ),
                    )
                  }
                  placeholder="Descrição"
                />
                <Input
                  value={a.valor}
                  inputMode="decimal"
                  onChange={(e) =>
                    setAdicionais((ls) =>
                      ls.map((l, j) =>
                        j === i ? { ...l, valor: e.target.value } : l,
                      ),
                    )
                  }
                  placeholder="0,00"
                  className="w-28"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Remover"
                  onClick={() =>
                    setAdicionais((ls) => ls.filter((_, j) => j !== i))
                  }
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
                  setAdicionais((ls) => [...ls, { descricao: "", valor: "" }])
                }
              >
                <Plus className="size-4" />
                Adicionar
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cf-obs">Observações</Label>
            <textarea
              id="cf-obs"
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="min-h-16 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex justify-between rounded-md bg-surface-muted px-3 py-2 text-sm">
            <span className="text-ink-muted">Subtotal do coffee</span>
            <span className="font-medium text-ink">
              {centavosParaBRL(previa)}
            </span>
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
            <Button type="submit" loading={salvando}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CoffeeEditor({
  locacaoId,
  coffee,
  niveis,
  editavel,
}: {
  locacaoId: string;
  coffee: CoffeeLinha[];
  niveis: NivelOpcao[];
  editavel: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [novoAberto, setNovoAberto] = useState(false);
  const [editando, setEditando] = useState<CoffeeLinha | null>(null);

  function remover(id: string) {
    iniciar(async () => {
      const r = await removerCoffeeAction(id);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Coffee removido.");
        router.refresh();
      }
    });
  }

  const semNiveis = niveis.length === 0;

  return (
    <div className="flex flex-col gap-2">
      {coffee.length === 0 ? (
        <p className="text-sm text-ink-muted">Sem coffee break.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {coffee.map((c) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="text-ink">
                  {c.nivelNome} · {c.qtdPessoas} pessoas
                  {c.horarioServirUtc
                    ? ` · servir ${horaSP(c.horarioServirUtc)}`
                    : ""}
                </p>
                {c.adicionais.length > 0 ? (
                  <p className="text-xs text-ink-muted">
                    {c.adicionais
                      .map(
                        (a) =>
                          `${a.descricao} (${centavosParaBRL(a.valorCentavos)})`,
                      )
                      .join(" · ")}
                  </p>
                ) : null}
                {c.observacoes ? (
                  <p className="text-xs text-ink-muted">{c.observacoes}</p>
                ) : null}
              </div>
              <span className="text-ink">{centavosParaBRL(c.valorCentavos)}</span>
              {editavel ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Editar"
                    disabled={pendente}
                    onClick={() => setEditando(c)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remover"
                    disabled={pendente}
                    onClick={() => remover(c.id)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {editavel ? (
        semNiveis ? (
          <p className="text-xs text-ink-muted">
            Cadastre um nível de coffee para poder adicionar.
          </p>
        ) : (
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setNovoAberto(true)}
            >
              <Plus className="size-4" />
              Adicionar coffee
            </Button>
          </div>
        )
      ) : coffee.length > 0 ? (
        <p className="text-xs text-ink-muted">
          Valores congelados no contrato — não editável.
        </p>
      ) : null}

      {!semNiveis ? (
        <CoffeeDialog
          locacaoId={locacaoId}
          niveis={niveis}
          aberto={novoAberto}
          aoAbrir={setNovoAberto}
        />
      ) : null}
      {editando ? (
        <CoffeeDialog
          key={editando.id}
          locacaoId={locacaoId}
          niveis={niveis}
          coffee={editando}
          aberto={editando !== null}
          aoAbrir={(o) => !o && setEditando(null)}
        />
      ) : null}
    </div>
  );
}
