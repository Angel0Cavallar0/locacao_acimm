"use client";

import { FileCheck2, Plus, SplitSquareHorizontal, Trash2, Undo2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { dataSP, horaSP, utcParaNaiveSP } from "@/lib/calendario/tempo";
import type { StatusLocacao } from "@/lib/locacoes/maquina-estados-core";
import {
  FORMA_PAGAMENTO_ROTULO,
  FORMAS_PAGAMENTO,
  type FormaPagamento,
  type PagamentoLinha,
} from "@/lib/locacoes/tipos";
import type { StatusPagamento } from "@/lib/pagamentos/pagamentos-core";
import {
  STATUS_PAGAMENTO_BADGE,
  STATUS_PAGAMENTO_ROTULO,
} from "@/lib/pagamentos/tipos";
import { brlParaCentavos, centavosParaBRL } from "@/lib/utils/moeda";
import {
  darBaixaAction,
  estornarAction,
  recomporAction,
  urlComprovanteAdminAction,
} from "./pagamentos-actions";

const selectClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function rotuloStatus(s: string): string {
  return STATUS_PAGAMENTO_ROTULO[s as StatusPagamento] ?? s;
}
function classeStatus(s: string): string {
  return STATUS_PAGAMENTO_BADGE[s as StatusPagamento] ?? "bg-surface-muted text-ink-muted";
}

// --- Baixa -----------------------------------------------------------------

function BaixaDialog({
  pagamento,
  aberto,
  aoAbrir,
}: {
  pagamento: PagamentoLinha;
  aberto: boolean;
  aoAbrir: (o: boolean) => void;
}) {
  const router = useRouter();
  const hoje = utcParaNaiveSP(new Date().toISOString()).slice(0, 10);
  const [dataEfetiva, setDataEfetiva] = useState("");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    setSalvando(true);
    const r = await darBaixaAction({
      pagamentoId: pagamento.id,
      dataEfetiva: dataEfetiva || undefined,
      observacao: observacao.trim() || undefined,
    });
    setSalvando(false);
    if (r.error) return toast.error(r.error);
    toast.success("Baixa registrada.");
    aoAbrir(false);
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={aoAbrir}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dar baixa</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-muted">
            {pagamento.descricao} · {FORMA_PAGAMENTO_ROTULO[pagamento.forma]} ·{" "}
            <span className="font-medium text-ink">
              {centavosParaBRL(pagamento.valorCentavos)}
            </span>
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="baixa-data">Data efetiva (opcional)</Label>
            <DatePicker
              id="baixa-data"
              value={dataEfetiva}
              onChange={setDataEfetiva}
              dataMax={hoje}
              placeholder="Hoje"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="baixa-obs">Observação (opcional)</Label>
            <Input
              id="baixa-obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: nº do boleto, Pix recebido…"
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            Cancelar
          </DialogClose>
          <Button loading={salvando} onClick={confirmar}>
            Confirmar baixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Estorno ---------------------------------------------------------------

function EstornoDialog({
  pagamento,
  aberto,
  aoAbrir,
}: {
  pagamento: PagamentoLinha;
  aberto: boolean;
  aoAbrir: (o: boolean) => void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    setSalvando(true);
    const r = await estornarAction({ pagamentoId: pagamento.id, motivo: motivo.trim() });
    setSalvando(false);
    if (r.error) return toast.error(r.error);
    toast.success("Pagamento estornado.");
    aoAbrir(false);
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={aoAbrir}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Estornar pagamento</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">
            O registro pago vira histórico e um novo pendente equivalente é
            criado. O status da locação não regride automaticamente.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="estorno-motivo">Motivo (obrigatório)</Label>
            <textarea
              id="estorno-motivo"
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              className="min-h-20 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Explique o motivo — aparece na linha do tempo."
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            Voltar
          </DialogClose>
          <Button
            variant="destructive"
            loading={salvando}
            disabled={motivo.trim().length === 0}
            onClick={confirmar}
          >
            Estornar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Recomposição (divisão híbrida) ---------------------------------------

interface ItemRecompor {
  descricao: string;
  forma: FormaPagamento;
  valor: string; // texto BRL
}

function RecomporDialog({
  locacaoId,
  valorTotalCentavos,
  pagamentos,
  aberto,
  aoAbrir,
}: {
  locacaoId: string;
  valorTotalCentavos: number;
  pagamentos: PagamentoLinha[];
  aberto: boolean;
  aoAbrir: (o: boolean) => void;
}) {
  const router = useRouter();
  const [itens, setItens] = useState<ItemRecompor[]>(
    pagamentos.map((p) => ({
      descricao: p.descricao,
      forma: p.forma,
      valor: (p.valorCentavos / 100).toFixed(2).replace(".", ","),
    })),
  );
  const [confirmaIsencao, setConfirmaIsencao] = useState(false);
  const [salvando, setSalvando] = useState(false);

  function atualizar(i: number, patch: Partial<ItemRecompor>) {
    setItens((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  }
  function adicionar() {
    setItens((xs) => [...xs, { descricao: "", forma: "pix", valor: "" }]);
  }
  function remover(i: number) {
    setItens((xs) => xs.filter((_, j) => j !== i));
  }

  const somaCentavos = itens.reduce((s, x) => s + brlParaCentavos(x.valor), 0);
  const bate = somaCentavos === valorTotalCentavos;
  const temIsento = itens.some((x) => x.forma === "isento");
  const podeSalvar =
    itens.length > 0 &&
    itens.every((x) => x.descricao.trim().length > 0) &&
    bate &&
    (!temIsento || confirmaIsencao);

  async function confirmar() {
    setSalvando(true);
    const r = await recomporAction({
      locacaoId,
      itens: itens.map((x) => ({
        descricao: x.descricao.trim(),
        forma: x.forma,
        valorCentavos: brlParaCentavos(x.valor),
      })),
    });
    setSalvando(false);
    if (r.error) return toast.error(r.error);
    toast.success("Pagamentos recompostos.");
    aoAbrir(false);
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={aoAbrir}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Dividir / editar pagamentos</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">
            Recomponha os registros (ex.: coffee no boleto, locação no Pix). A
            soma precisa fechar exatamente com o total.
          </p>

          <div className="flex flex-col gap-2">
            {itens.map((x, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: linhas efêmeras do editor
              <div key={i} className="flex flex-col gap-2 rounded-lg border p-2.5">
                <div className="flex items-center gap-2">
                  <Input
                    value={x.descricao}
                    onChange={(e) => atualizar(i, { descricao: e.target.value })}
                    placeholder="Descrição (ex.: Locação, Coffee)"
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remover linha"
                    disabled={itens.length === 1}
                    onClick={() => remover(i)}
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    aria-label="Forma"
                    className={selectClasses}
                    value={x.forma}
                    onChange={(e) =>
                      atualizar(i, { forma: e.target.value as FormaPagamento })
                    }
                  >
                    {FORMAS_PAGAMENTO.map((f) => (
                      <option key={f.valor} value={f.valor}>
                        {f.rotulo}
                      </option>
                    ))}
                  </select>
                  <Input
                    inputMode="decimal"
                    value={x.valor}
                    onChange={(e) => atualizar(i, { valor: e.target.value })}
                    placeholder="0,00"
                  />
                </div>
              </div>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={adicionar}
            className="self-start"
          >
            <Plus className="size-4" />
            Adicionar pagamento
          </Button>

          <div className="flex items-center justify-between border-t pt-2 text-sm">
            <span className="text-ink-muted">Soma</span>
            <span className={bate ? "font-medium text-ink" : "font-medium text-destructive"}>
              {centavosParaBRL(somaCentavos)} / {centavosParaBRL(valorTotalCentavos)}
            </span>
          </div>
          {!bate ? (
            <p className="text-xs text-destructive">
              A soma deve ser igual ao total da locação.
            </p>
          ) : null}

          {temIsento ? (
            <label className="flex items-start gap-2 rounded-md bg-brand/5 px-3 py-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={confirmaIsencao}
                onChange={(e) => setConfirmaIsencao(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Confirmo que os itens marcados como{" "}
                <span className="font-medium">Isento</span> não serão cobrados.
              </span>
            </label>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            Cancelar
          </DialogClose>
          <Button loading={salvando} disabled={!podeSalvar} onClick={confirmar}>
            Salvar recomposição
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Seção -----------------------------------------------------------------

export function PagamentosGestao({
  locacaoId,
  status,
  valorTotalCentavos,
  pagamentos,
}: {
  locacaoId: string;
  status: StatusLocacao;
  valorTotalCentavos: number;
  pagamentos: PagamentoLinha[];
}) {
  const [baixando, setBaixando] = useState<PagamentoLinha | null>(null);
  const [estornando, setEstornando] = useState<PagamentoLinha | null>(null);
  const [recompondo, setRecompondo] = useState(false);
  const [abrindo, setAbrindo] = useState<string | null>(null);

  if (pagamentos.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Os pagamentos são gerados quando a locação vai para pagamento.
      </p>
    );
  }

  const vigentes = pagamentos.filter((p) => p.status !== "estornado");
  const totalPago = vigentes
    .filter((p) => p.status === "pago" || p.status === "isento")
    .reduce((s, p) => s + p.valorCentavos, 0);
  const todosPendentes = pagamentos.every((p) => p.status === "pendente");
  const podeRecompor = todosPendentes && status === "aguardando_pagamento";
  const temEstorno = pagamentos.some((p) => p.status === "estornado");

  async function verComprovante(id: string) {
    setAbrindo(id);
    const r = await urlComprovanteAdminAction(id);
    setAbrindo(null);
    if (r.error) return toast.error(r.error);
    if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col gap-2">
        {pagamentos.map((p) => {
          const estornado = p.status === "estornado";
          return (
            <li
              key={p.id}
              className={`flex flex-col gap-1.5 rounded-lg border p-3 ${estornado ? "opacity-70" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink">{p.descricao}</p>
                  <p className="text-xs text-ink-muted">
                    {FORMA_PAGAMENTO_ROTULO[p.forma]} ·{" "}
                    {centavosParaBRL(p.valorCentavos)}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${classeStatus(p.status)}`}
                >
                  {rotuloStatus(p.status)}
                </span>
              </div>

              {p.baixaEmUtc ? (
                <p className="text-xs text-ink-muted">
                  Baixado por {p.baixaPorNome ?? "ACIMM"} em {dataSP(p.baixaEmUtc)}{" "}
                  {horaSP(p.baixaEmUtc)}
                </p>
              ) : null}
              {p.observacao ? (
                <p className="text-xs text-ink-muted">{p.observacao}</p>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                {p.temComprovante ? (
                  <Button
                    variant="outline"
                    size="sm"
                    loading={abrindo === p.id}
                    onClick={() => verComprovante(p.id)}
                  >
                    <FileCheck2 className="size-4" />
                    Ver comprovante
                  </Button>
                ) : null}
                {p.status === "pendente" ? (
                  <Button size="sm" onClick={() => setBaixando(p)}>
                    Dar baixa
                  </Button>
                ) : null}
                {p.status === "pago" ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEstornando(p)}
                  >
                    <Undo2 className="size-4" />
                    Estornar
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between border-t pt-2 text-sm">
        <span className="text-ink-muted">Quitado</span>
        <span className="font-medium text-ink">
          {centavosParaBRL(totalPago)} / {centavosParaBRL(valorTotalCentavos)}
        </span>
      </div>

      {podeRecompor ? (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setRecompondo(true)}
          className="self-start"
        >
          <SplitSquareHorizontal className="size-4" />
          Dividir / editar
        </Button>
      ) : null}

      {temEstorno && status === "confirmada" ? (
        <p className="rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
          Há pagamento estornado após a confirmação. A locação segue confirmada —
          se precisar regredir, use o cancelamento.
        </p>
      ) : null}

      {baixando ? (
        <BaixaDialog
          key={baixando.id}
          pagamento={baixando}
          aberto={baixando !== null}
          aoAbrir={(o) => !o && setBaixando(null)}
        />
      ) : null}
      {estornando ? (
        <EstornoDialog
          key={estornando.id}
          pagamento={estornando}
          aberto={estornando !== null}
          aoAbrir={(o) => !o && setEstornando(null)}
        />
      ) : null}
      {recompondo ? (
        <RecomporDialog
          locacaoId={locacaoId}
          valorTotalCentavos={valorTotalCentavos}
          pagamentos={pagamentos}
          aberto={recompondo}
          aoAbrir={setRecompondo}
        />
      ) : null}
    </div>
  );
}
