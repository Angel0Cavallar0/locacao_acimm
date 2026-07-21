"use client";

import {
  Archive,
  ArchiveRestore,
  MessageCircle,
  Phone,
  Plus,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dataSP } from "@/lib/calendario/tempo";
import {
  type EntradaFila,
  type ContagensFila,
  rotuloSala,
  SITUACAO_ROTULO,
  type VisaoFila,
} from "@/lib/lista-espera/tipos";
import { normalizarTelefoneBR } from "@/lib/utils/telefone";
import { mascararTelefone } from "@/lib/utils/mascaras";
import { AssociadoAutocomplete } from "../locacoes/nova/associado-autocomplete";
import type { AssociadoBusca } from "../locacoes/nova/tipos";
import {
  adicionarFilaAction,
  arquivarFilaAction,
  restaurarFilaAction,
} from "./actions";

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const MOTIVOS = [
  "Desistiu",
  "Não respondeu",
  "Resolveu outra data",
  "Outro",
];

function ddmmyyyy(data: string): string {
  return data.split("-").reverse().join("/");
}

function hojeLocal(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

/** wa.me com mensagem pronta; só abre o canal (nada é enviado pelo sistema). */
function waLink(entrada: EntradaFila): string | null {
  const n = normalizarTelefoneBR(entrada.contato);
  if (!("numero" in n)) return null;
  const texto = encodeURIComponent(
    `Olá ${entrada.nome}! Aqui é da ACIMM — surgiu disponibilidade para ${rotuloSala(
      entrada.salaNome,
    )} em ${ddmmyyyy(entrada.data)}. Podemos reservar para você?`,
  );
  return `https://wa.me/${n.numero}?text=${texto}`;
}

interface Grupo {
  data: string;
  salas: { chave: string; nome: string | null; itens: EntradaFila[] }[];
}

export function ListaEsperaClient({
  entradas,
  contagens,
  salas,
  filtro,
}: {
  entradas: EntradaFila[];
  contagens: ContagensFila;
  salas: { id: string; nome: string }[];
  filtro: { visao: VisaoFila; salaId: string | null; de: string | null; ate: string | null };
}) {
  const router = useRouter();
  const [adicionar, setAdicionar] = useState(false);
  const [arquivando, setArquivando] = useState<EntradaFila | null>(null);

  function irPara(mud: Record<string, string | null>) {
    const base: Record<string, string | null> = {
      visao: filtro.visao,
      sala: filtro.salaId,
      de: filtro.de,
      ate: filtro.ate,
      ...mud,
    };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    router.push(`/admin/lista-espera?${p.toString()}`);
  }

  const grupos = useMemo<Grupo[]>(() => {
    const porData = new Map<string, Map<string, EntradaFila[]>>();
    for (const e of entradas) {
      if (!porData.has(e.data)) porData.set(e.data, new Map());
      const salasMap = porData.get(e.data) as Map<string, EntradaFila[]>;
      const chave = e.salaId ?? "q";
      if (!salasMap.has(chave)) salasMap.set(chave, []);
      (salasMap.get(chave) as EntradaFila[]).push(e);
    }
    return [...porData.entries()].map(([data, salasMap]) => ({
      data,
      salas: [...salasMap.entries()].map(([chave, itens]) => ({
        chave,
        nome: itens[0].salaNome,
        itens,
      })),
    }));
  }, [entradas]);

  const abas: { valor: VisaoFila; rotulo: string; n: number }[] = [
    { valor: "aguardando", rotulo: "Aguardando", n: contagens.aguardando },
    { valor: "vencidas", rotulo: "Vencidas", n: contagens.vencidas },
    { valor: "encerradas", rotulo: "Encerradas", n: contagens.encerradas },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-ink-muted">
          Interessados por data e sala, na ordem de chegada. Contato e conversão
          em um toque.
        </p>
        <Button size="sm" onClick={() => setAdicionar(true)}>
          <UserPlus className="size-4" />
          Adicionar à fila
        </Button>
      </div>

      {/* Abas de visão */}
      <div className="flex gap-1.5">
        {abas.map((a) => (
          <button
            key={a.valor}
            type="button"
            onClick={() => irPara({ visao: a.valor })}
            className={
              filtro.visao === a.valor
                ? "rounded-full border border-brand bg-brand/10 px-3 py-1 text-xs font-medium text-brand"
                : "rounded-full border px-3 py-1 text-xs text-ink-muted hover:text-ink"
            }
          >
            {a.rotulo} · {a.n}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-end gap-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-sala" className="text-xs">
            Sala
          </Label>
          <select
            id="f-sala"
            className={inputClasses}
            value={filtro.salaId ?? ""}
            onChange={(e) => irPara({ sala: e.target.value || null })}
          >
            <option value="">Todas</option>
            {salas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-de" className="text-xs">
            De
          </Label>
          <input
            id="f-de"
            type="date"
            className={inputClasses}
            value={filtro.de ?? ""}
            onChange={(e) => irPara({ de: e.target.value || null })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="f-ate" className="text-xs">
            Até
          </Label>
          <input
            id="f-ate"
            type="date"
            className={inputClasses}
            value={filtro.ate ?? ""}
            onChange={(e) => irPara({ ate: e.target.value || null })}
          />
        </div>
        {(filtro.salaId || filtro.de || filtro.ate) ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => irPara({ sala: null, de: null, ate: null })}
          >
            Limpar
          </Button>
        ) : null}
      </div>

      {/* Lista agrupada */}
      {grupos.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-ink-muted">
            Nenhuma entrada nesta visão.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {grupos.map((g) => (
            <div key={g.data} className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-ink">
                {ddmmyyyy(g.data)}
              </h3>
              {g.salas.map((sg) => (
                <div key={sg.chave} className="flex flex-col gap-2">
                  <p className="text-xs font-medium text-ink-muted">
                    {rotuloSala(sg.nome)}
                  </p>
                  {sg.itens.map((e) => (
                    <EntradaCard
                      key={e.id}
                      entrada={e}
                      aoArquivar={() => setArquivando(e)}
                      aoRestaurar={async () => {
                        const r = await restaurarFilaAction(e.id);
                        if ("erro" in r) {
                          toast.error(r.erro);
                          return;
                        }
                        toast.success("Entrada restaurada.");
                        router.refresh();
                      }}
                    />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {adicionar ? (
        <AdicionarDialog
          salas={salas}
          aoFechar={() => setAdicionar(false)}
          aoConcluir={() => {
            setAdicionar(false);
            router.refresh();
          }}
        />
      ) : null}

      {arquivando ? (
        <ArquivarDialog
          entrada={arquivando}
          aoFechar={() => setArquivando(null)}
          aoConcluir={() => {
            setArquivando(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}

function EntradaCard({
  entrada: e,
  aoArquivar,
  aoRestaurar,
}: {
  entrada: EntradaFila;
  aoArquivar: () => void;
  aoRestaurar: () => Promise<void>;
}) {
  const [restaurando, setRestaurando] = useState(false);
  const wa = waLink(e);
  const telDigitos = e.contato.replace(/\D/g, "");
  const naFila = e.situacao === "aguardando" || e.situacao === "vencida";
  const podeRestaurar =
    e.situacao === "arquivada" && e.data >= hojeLocal();

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            {naFila ? (
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
                {e.posicao}
              </span>
            ) : null}
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-medium text-ink">
                {e.nome}
                {e.associadoId ? (
                  <Badge variant="secondary">Associado</Badge>
                ) : (
                  <Badge variant="outline">Externo</Badge>
                )}
              </p>
              <p className="text-xs text-ink-muted">{e.contato}</p>
            </div>
          </div>
          {!naFila ? (
            <Badge variant={e.situacao === "convertida" ? "secondary" : "outline"}>
              {SITUACAO_ROTULO[e.situacao]}
            </Badge>
          ) : null}
        </div>

        {e.observacoes ? (
          <p className="text-xs text-ink-muted">{e.observacoes}</p>
        ) : null}

        <p className="text-xs text-ink-muted">
          Entrou em {dataSP(e.criadoEmUtc)}
        </p>

        {e.situacao === "convertida" && e.convertidoLocacaoId ? (
          <Link
            href={`/admin/locacoes/${e.convertidoLocacaoId}`}
            className="text-xs font-medium text-brand hover:underline"
          >
            Convertida em LOC-{String(e.convertidoNumero ?? 0).padStart(6, "0")}
          </Link>
        ) : null}

        {e.situacao === "arquivada" ? (
          <p className="text-xs text-ink-muted">
            Arquivada
            {e.arquivadoPorNome ? ` por ${e.arquivadoPorNome}` : ""}
            {e.arquivadoMotivo ? ` · ${e.arquivadoMotivo}` : ""}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-1">
          {wa ? (
            <Button variant="outline" size="sm" render={<a href={wa} target="_blank" rel="noreferrer" />}>
              <MessageCircle className="size-4" />
              WhatsApp
            </Button>
          ) : null}
          {telDigitos.length >= 8 ? (
            <Button variant="outline" size="sm" render={<a href={`tel:${telDigitos}`} />}>
              <Phone className="size-4" />
              Ligar
            </Button>
          ) : null}

          {naFila ? (
            <>
              <Button
                size="sm"
                render={<Link href={`/admin/locacoes/nova?fila=${e.id}`} />}
              >
                <Plus className="size-4" />
                Converter em locação
              </Button>
              <Button variant="ghost" size="sm" onClick={aoArquivar}>
                <Archive className="size-4" />
                Arquivar
              </Button>
            </>
          ) : null}

          {podeRestaurar ? (
            <Button
              variant="ghost"
              size="sm"
              loading={restaurando}
              onClick={async () => {
                setRestaurando(true);
                await aoRestaurar();
                setRestaurando(false);
              }}
            >
              <ArchiveRestore className="size-4" />
              Restaurar
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function ArquivarDialog({
  entrada,
  aoFechar,
  aoConcluir,
}: {
  entrada: EntradaFila;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    setSalvando(true);
    const r = await arquivarFilaAction({
      id: entrada.id,
      motivo: motivo || undefined,
    });
    setSalvando(false);
    if ("erro" in r) return toast.error(r.erro);
    toast.success("Entrada arquivada.");
    aoConcluir();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Arquivar da fila</DialogTitle>
          <DialogDescription>
            {entrada.nome} sai da fila sem locar. Reversível enquanto a data não
            passar. Nada é excluído.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="motivo">Motivo (opcional)</Label>
          <select
            id="motivo"
            className={inputClasses}
            value={motivo}
            onChange={(ev) => setMotivo(ev.target.value)}
          >
            <option value="">Sem motivo</option>
            {MOTIVOS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button variant="destructive" loading={salvando} onClick={confirmar}>
            Arquivar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AdicionarDialog({
  salas,
  aoFechar,
  aoConcluir,
}: {
  salas: { id: string; nome: string }[];
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [tipo, setTipo] = useState<"associado" | "externo">("associado");
  const [assoc, setAssoc] = useState<AssociadoBusca | null>(null);
  const [salaId, setSalaId] = useState<string>("");
  const [data, setData] = useState("");
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  function selecionarAssociado(a: AssociadoBusca) {
    setAssoc(a);
    setNome(a.razaoSocial ?? a.nome);
    setContato(mascararTelefone(a.telefone ?? ""));
  }

  async function confirmar() {
    if (!data) return toast.error("Informe a data.");
    if (!nome.trim() || !contato.trim())
      return toast.error("Informe nome e contato.");
    if (tipo === "associado" && !assoc)
      return toast.error("Selecione o associado ou use 'Externo'.");

    setSalvando(true);
    const r = await adicionarFilaAction({
      salaId: salaId || null,
      data,
      associadoId: tipo === "associado" ? (assoc?.id ?? null) : null,
      nome: nome.trim(),
      contato: contato.trim(),
      observacoes: observacoes.trim() || undefined,
    });
    setSalvando(false);
    if ("erro" in r) return toast.error(r.erro);
    toast.success("Adicionado à fila.");
    aoConcluir();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar à fila de espera</DialogTitle>
          <DialogDescription>
            Para quem liga ou passa na ACIMM. A equipe é quem contata e decide o
            fechamento.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="a-sala">Sala</Label>
              <select
                id="a-sala"
                className={inputClasses}
                value={salaId}
                onChange={(e) => setSalaId(e.target.value)}
              >
                <option value="">Qualquer sala</option>
                {salas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="a-data">Data</Label>
              <input
                id="a-data"
                type="date"
                min={hojeLocal()}
                className={inputClasses}
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
          </div>

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
              <Label htmlFor="a-nome">Nome</Label>
              <Input
                id="a-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="a-contato">Contato (WhatsApp)</Label>
              <Input
                id="a-contato"
                value={contato}
                onChange={(e) => setContato(mascararTelefone(e.target.value))}
                placeholder="(00) 00000-0000"
                inputMode="tel"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="a-obs">Observações</Label>
            <Input
              id="a-obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Preferência de horário, etc."
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button loading={salvando} onClick={confirmar}>
            Adicionar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
