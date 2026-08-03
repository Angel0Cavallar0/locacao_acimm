"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
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
import type { AdicionalLinha } from "@/lib/locacoes/tipos";
import { exigeValorManual, usaQuantidade } from "@/lib/servicos-adicionais/core";
import type { ServicoAdicional } from "@/lib/servicos-adicionais/tipos";
import { brlParaCentavos, centavosParaBRL } from "@/lib/utils/moeda";
import {
  adicionarAdicionalAction,
  editarAdicionalAction,
  removerAdicionalAction,
} from "./actions";

const selectClasses =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function subtotal(a: { quantidade: number; valorUnitarioCentavos: number }) {
  return Math.round(a.quantidade * a.valorUnitarioCentavos);
}

function AdicionalDialog({
  locacaoId,
  adicional,
  servicos,
  aberto,
  aoAbrir,
}: {
  locacaoId: string;
  adicional?: AdicionalLinha;
  servicos: ServicoAdicional[];
  aberto: boolean;
  aoAbrir: (o: boolean) => void;
}) {
  const router = useRouter();
  const editando = Boolean(adicional);
  const [servicoId, setServicoId] = useState("");
  const [descricao, setDescricao] = useState(adicional?.descricao ?? "");
  const [quantidade, setQuantidade] = useState(
    adicional ? String(adicional.quantidade) : "1",
  );
  const [valor, setValor] = useState(
    adicional
      ? (adicional.valorUnitarioCentavos / 100).toFixed(2).replace(".", ",")
      : "",
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const servico = useMemo(
    () => servicos.find((s) => s.id === servicoId) ?? null,
    [servicos, servicoId],
  );
  const valorTravado = servico != null && !exigeValorManual(servico.modeloCobranca);
  const mostraQuantidade = !servico || usaQuantidade(servico.modeloCobranca);

  function escolherServico(id: string) {
    setServicoId(id);
    const s = servicos.find((x) => x.id === id) ?? null;
    if (!s) return;
    setDescricao(s.nome);
    setQuantidade("1");
    if (s.valorUnitarioCentavos != null) {
      setValor((s.valorUnitarioCentavos / 100).toFixed(2).replace(".", ","));
    } else {
      setValor(""); // sob consulta
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    const qtd = mostraQuantidade
      ? Number(quantidade.replace(",", ".")) || 0
      : 1;
    const payload = {
      descricao: descricao.trim(),
      quantidade: qtd,
      valorUnitarioCentavos: brlParaCentavos(valor),
    };
    const r = adicional
      ? await editarAdicionalAction({ adicionalId: adicional.id, ...payload })
      : await adicionarAdicionalAction({
          locacaoId,
          ...payload,
          servicoAdicionalId: servicoId || null,
        });
    setSalvando(false);
    if (r.error) {
      setErro(r.error);
      return;
    }
    toast.success(adicional ? "Adicional salvo." : "Adicional incluído.");
    aoAbrir(false);
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={aoAbrir}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{adicional ? "Editar" : "Novo"} adicional</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          {!editando && servicos.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ad-servico">Do catálogo</Label>
              <select
                id="ad-servico"
                className={selectClasses}
                value={servicoId}
                onChange={(e) => escolherServico(e.target.value)}
              >
                <option value="">Outro (texto livre)</option>
                {servicos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                    {s.valorUnitarioCentavos != null
                      ? ` — ${centavosParaBRL(s.valorUnitarioCentavos)}`
                      : " — sob consulta"}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ad-desc">Descrição</Label>
            <Input
              id="ad-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Hora extra, mobiliário, garrafas…"
              readOnly={servico != null}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {mostraQuantidade ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="ad-qtd">Quantidade</Label>
                <Input
                  id="ad-qtd"
                  inputMode="decimal"
                  value={quantidade}
                  onChange={(e) => setQuantidade(e.target.value)}
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ad-valor">Valor unitário (R$)</Label>
              <Input
                id="ad-valor"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={servico && !valorTravado ? "cotação" : "0,00"}
                readOnly={valorTravado}
              />
            </div>
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

export function AdicionaisEditor({
  locacaoId,
  adicionais,
  servicos,
  editavel,
}: {
  locacaoId: string;
  adicionais: AdicionalLinha[];
  servicos: ServicoAdicional[];
  editavel: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [novoAberto, setNovoAberto] = useState(false);
  const [editando, setEditando] = useState<AdicionalLinha | null>(null);

  function remover(id: string) {
    iniciar(async () => {
      const r = await removerAdicionalAction(id);
      if (r.error) toast.error(r.error);
      else {
        toast.success("Adicional removido.");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {adicionais.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum adicional.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {adicionais.map((a) => (
            <li key={a.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="text-ink">{a.descricao}</p>
                <p className="text-xs text-ink-muted">
                  {a.quantidade} × {centavosParaBRL(a.valorUnitarioCentavos)}
                </p>
              </div>
              <span className="text-ink">{centavosParaBRL(subtotal(a))}</span>
              {editavel ? (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Editar"
                    disabled={pendente}
                    onClick={() => setEditando(a)}
                  >
                    <Pencil className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remover"
                    disabled={pendente}
                    onClick={() => remover(a.id)}
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
        <div>
          <Button variant="outline" size="sm" onClick={() => setNovoAberto(true)}>
            <Plus className="size-4" />
            Adicionar
          </Button>
        </div>
      ) : null}

      <AdicionalDialog
        locacaoId={locacaoId}
        servicos={servicos}
        aberto={novoAberto}
        aoAbrir={setNovoAberto}
      />
      {editando ? (
        <AdicionalDialog
          key={editando.id}
          locacaoId={locacaoId}
          adicional={editando}
          servicos={servicos}
          aberto={editando !== null}
          aoAbrir={(o) => !o && setEditando(null)}
        />
      ) : null}
    </div>
  );
}
