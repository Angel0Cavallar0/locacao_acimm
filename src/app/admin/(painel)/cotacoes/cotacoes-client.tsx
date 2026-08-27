"use client";

import { Archive, FileDown, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dataSP } from "@/lib/calendario/tempo";
import type { CotacaoLista, StatusCotacao } from "@/lib/cotacoes/tipos";
import { rotuloCotacao, STATUS_COTACAO_ROTULO } from "@/lib/cotacoes/tipos";
import { PERIODOS, type PeriodoDia } from "@/lib/dominio";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { mascararDocumento, mascararTelefone } from "@/lib/utils/mascaras";
import { AssociadoAutocomplete } from "../locacoes/nova/associado-autocomplete";
import type { AssociadoBusca } from "../locacoes/nova/tipos";
import {
  arquivarCotacaoAction,
  criarCotacaoAction,
  exportarCotacaoPdfAction,
} from "./actions";

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const VISOES: { valor: StatusCotacao | "todas"; rotulo: string }[] = [
  { valor: "pendente", rotulo: "Pendentes" },
  { valor: "convertida", rotulo: "Convertidas" },
  { valor: "arquivada", rotulo: "Arquivadas" },
  { valor: "todas", rotulo: "Todas" },
];

function baixarPdf(base64: string, nome: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export function CotacoesClient({
  cotacoes,
  status,
  salas,
  niveis,
}: {
  cotacoes: CotacaoLista[];
  status: StatusCotacao | "todas";
  salas: { id: string; nome: string }[];
  niveis: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [nova, setNova] = useState(false);
  const [exportando, setExportando] = useState<string | null>(null);

  async function exportar(id: string) {
    setExportando(id);
    const r = await exportarCotacaoPdfAction(id);
    setExportando(null);
    if ("error" in r) return toast.error(r.error);
    baixarPdf(r.base64, r.nome);
  }

  async function arquivar(id: string) {
    const r = await arquivarCotacaoAction(id);
    if ("erro" in r) return toast.error(r.erro);
    toast.success("Cotação arquivada.");
    router.refresh();
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Cotações
          </h2>
          <p className="text-sm text-ink-muted">
            Orçamento sem compromisso de agenda — vira locação de verdade só
            quando o cliente confirmar.
          </p>
        </div>
        <Button size="sm" onClick={() => setNova(true)}>
          <Plus className="size-4" />
          Nova cotação
        </Button>
      </div>

      <div className="flex gap-1.5">
        {VISOES.map((v) => (
          <Link
            key={v.valor}
            href={`/admin/cotacoes?status=${v.valor}`}
            className={
              status === v.valor
                ? "rounded-full border border-brand bg-brand/10 px-3 py-1 text-xs font-medium text-brand"
                : "rounded-full border px-3 py-1 text-xs text-ink-muted hover:text-ink"
            }
          >
            {v.rotulo}
          </Link>
        ))}
      </div>

      {cotacoes.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-ink-muted">
            Nenhuma cotação nesta visão.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {cotacoes.map((c) => (
            <Card key={c.id}>
              <CardContent className="flex flex-col gap-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-ink">
                      {rotuloCotacao(c.numero)} · {c.locatarioNome}
                      <Badge
                        variant={c.status === "convertida" ? "secondary" : "outline"}
                      >
                        {STATUS_COTACAO_ROTULO[c.status]}
                      </Badge>
                    </p>
                    <p className="text-xs text-ink-muted">
                      {c.salas.join(", ") || "—"}
                      {c.data ? ` · ${dataSP(`${c.data}T12:00:00`)}` : " · sem data"}
                      {c.qtdPessoas ? ` · ${c.qtdPessoas} pessoas` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 font-medium text-ink">
                    {centavosParaBRL(c.valorTotalCentavos)}
                  </p>
                </div>

                {c.status === "convertida" && c.convertidoLocacaoId ? (
                  <Link
                    href={`/admin/locacoes/${c.convertidoLocacaoId}`}
                    className="text-xs font-medium text-brand hover:underline"
                  >
                    Convertida em LOC-{String(c.convertidoNumero ?? 0).padStart(6, "0")}
                  </Link>
                ) : null}

                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    variant="outline"
                    size="sm"
                    loading={exportando === c.id}
                    onClick={() => exportar(c.id)}
                  >
                    <FileDown className="size-4" />
                    Exportar PDF
                  </Button>
                  {c.status === "pendente" ? (
                    <>
                      <Button
                        size="sm"
                        render={
                          <Link href={`/admin/locacoes/nova?cotacao=${c.id}`} />
                        }
                      >
                        <Plus className="size-4" />
                        Converter em locação
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => arquivar(c.id)}
                      >
                        <Archive className="size-4" />
                        Arquivar
                      </Button>
                    </>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {nova ? (
        <NovaCotacaoDialog
          salas={salas}
          niveis={niveis}
          aoFechar={() => setNova(false)}
          aoConcluir={() => {
            setNova(false);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

interface Adicional {
  descricao: string;
  valor: string;
}

function NovaCotacaoDialog({
  salas,
  niveis,
  aoFechar,
  aoConcluir,
}: {
  salas: { id: string; nome: string }[];
  niveis: { id: string; nome: string }[];
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [tipo, setTipo] = useState<"associado" | "externo">("associado");
  const [assoc, setAssoc] = useState<AssociadoBusca | null>(null);
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [salaIds, setSalaIds] = useState<string[]>([]);
  const [data, setData] = useState("");
  const [periodo, setPeriodo] = useState<PeriodoDia>("manha");
  const [qtdPessoas, setQtdPessoas] = useState("");
  const [coffeeIncluir, setCoffeeIncluir] = useState(false);
  const [coffeeNivelId, setCoffeeNivelId] = useState("");
  const [adicionais, setAdicionais] = useState<Adicional[]>([]);
  const [salvando, setSalvando] = useState(false);

  function selecionarAssociado(a: AssociadoBusca) {
    setAssoc(a);
    setNome(a.razaoSocial ?? a.nome);
    setDocumento(mascararDocumento(a.documento ?? ""));
    setEmail(a.emails[0] ?? "");
    setTelefone(mascararTelefone(a.telefone ?? ""));
  }

  function alternarSala(id: string) {
    setSalaIds((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  }

  async function confirmar() {
    if (!nome.trim()) return toast.error("Informe o nome do locatário.");
    if (salaIds.length === 0) return toast.error("Selecione ao menos uma sala.");
    if (!data) return toast.error("Informe a data de referência.");
    if (!qtdPessoas) return toast.error("Informe o nº de pessoas.");
    if (tipo === "associado" && !assoc)
      return toast.error("Selecione o associado ou use 'Externo'.");

    setSalvando(true);
    const r = await criarCotacaoAction({
      condicao: tipo === "associado" ? "associado" : "nao_associado",
      associadoId: tipo === "associado" ? (assoc?.id ?? null) : null,
      locatarioNome: nome.trim(),
      locatarioDocumento: documento,
      locatarioEmail: email,
      locatarioTelefone: telefone,
      salaIds,
      data,
      periodo,
      qtdPessoas: Number(qtdPessoas) || 0,
      coffee:
        coffeeIncluir && coffeeNivelId
          ? { nivelId: coffeeNivelId, qtdPessoas: Number(qtdPessoas) || 0 }
          : null,
      adicionais: adicionais
        .filter((a) => a.descricao.trim())
        .map((a) => ({
          descricao: a.descricao.trim(),
          valorCentavos: Math.round(Number(a.valor.replace(",", ".")) * 100) || 0,
        })),
    });
    setSalvando(false);
    if ("erro" in r) return toast.error(r.erro);
    toast.success("Cotação registrada.");
    aoConcluir();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova cotação</DialogTitle>
          <DialogDescription>
            Orçamento salvo como pendente — não reserva a agenda. Convertível
            em locação de verdade a qualquer momento.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto pr-1">
          <div className="flex gap-1.5">
            {(["associado", "externo"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTipo(t)}
                className={
                  tipo === t
                    ? "rounded-full border border-brand bg-brand/10 px-3 py-1 text-xs font-medium text-brand"
                    : "rounded-full border px-3 py-1 text-xs text-ink-muted hover:text-ink"
                }
              >
                {t === "associado" ? "Associado" : "Externo"}
              </button>
            ))}
          </div>

          {tipo === "associado" ? (
            <>
              <AssociadoAutocomplete aoSelecionar={selecionarAssociado} />
              {assoc ? (
                <p className="text-xs text-ink-muted">
                  Vinculado a <span className="text-ink">{assoc.nome}</span>
                </p>
              ) : null}
            </>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-nome">Nome</Label>
              <Input id="c-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-tel">Telefone</Label>
              <Input
                id="c-tel"
                value={telefone}
                onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Sala(s)</Label>
            <div className="flex flex-wrap gap-2">
              {salas.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => alternarSala(s.id)}
                  className={
                    salaIds.includes(s.id)
                      ? "rounded-full border border-brand bg-brand/10 px-3 py-1 text-xs font-medium text-brand"
                      : "rounded-full border px-3 py-1 text-xs text-ink-muted hover:text-ink"
                  }
                >
                  {s.nome}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-data">Data de referência</Label>
              <DatePicker id="c-data" value={data} onChange={setData} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="c-periodo">Período</Label>
              <select
                id="c-periodo"
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
              <Label htmlFor="c-pessoas">Pessoas</Label>
              <Input
                id="c-pessoas"
                inputMode="numeric"
                value={qtdPessoas}
                onChange={(e) => setQtdPessoas(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={coffeeIncluir}
              onChange={(e) => setCoffeeIncluir(e.target.checked)}
            />
            Incluir coffee break
          </label>
          {coffeeIncluir ? (
            <select
              className={inputClasses}
              value={coffeeNivelId}
              onChange={(e) => setCoffeeNivelId(e.target.value)}
            >
              <option value="">Selecione o nível…</option>
              {niveis.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.nome}
                </option>
              ))}
            </select>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label>Adicionais</Label>
            {adicionais.map((a, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: linhas efêmeras do editor
              <div key={i} className="flex gap-2">
                <Input
                  value={a.descricao}
                  placeholder="Descrição"
                  onChange={(e) =>
                    setAdicionais((xs) =>
                      xs.map((x, j) => (j === i ? { ...x, descricao: e.target.value } : x)),
                    )
                  }
                />
                <Input
                  value={a.valor}
                  placeholder="0,00"
                  inputMode="decimal"
                  className="w-28"
                  onChange={(e) =>
                    setAdicionais((xs) =>
                      xs.map((x, j) => (j === i ? { ...x, valor: e.target.value } : x)),
                    )
                  }
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              onClick={() => setAdicionais((xs) => [...xs, { descricao: "", valor: "" }])}
            >
              <Plus className="size-4" />
              Adicionar
            </Button>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button loading={salvando} onClick={confirmar}>
            Salvar cotação
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
