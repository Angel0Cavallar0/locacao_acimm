"use client";

import { Archive, ArchiveRestore, MessageCircle, Phone, Plus } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dataSP } from "@/lib/calendario/tempo";
import type {
  ContagensPendencia,
  EntradaPendencia,
} from "@/lib/pendencias/tipos";
import { SITUACAO_PENDENCIA_ROTULO } from "@/lib/pendencias/tipos";
import { mascararTelefone } from "@/lib/utils/mascaras";
import { normalizarTelefoneBR } from "@/lib/utils/telefone";
import { AssociadoAutocomplete } from "../locacoes/nova/associado-autocomplete";
import type { AssociadoBusca } from "../locacoes/nova/tipos";
import {
  adicionarPendenciaAction,
  arquivarPendenciaAction,
  restaurarPendenciaAction,
} from "./actions";

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const MOTIVOS = ["Desistiu", "Não respondeu", "Resolveu de outro jeito", "Outro"];

/** wa.me com mensagem pronta; só abre o canal (nada é enviado pelo sistema). */
function waLink(entrada: EntradaPendencia): string | null {
  const n = normalizarTelefoneBR(entrada.contato);
  if (!("numero" in n)) return null;
  const texto = encodeURIComponent(
    `Olá ${entrada.nome}! Aqui é da ACIMM — surgiu disponibilidade para você usar a sala. Quer marcar um horário?`,
  );
  return `https://wa.me/${n.numero}?text=${texto}`;
}

export function PendenciasClient({
  entradas,
  contagens,
  visao,
}: {
  entradas: EntradaPendencia[];
  contagens: ContagensPendencia;
  visao: "aguardando" | "encerradas";
}) {
  const router = useRouter();
  const [adicionar, setAdicionar] = useState(false);
  const [arquivando, setArquivando] = useState<EntradaPendencia | null>(null);

  const abas: { valor: "aguardando" | "encerradas"; rotulo: string; n: number }[] = [
    { valor: "aguardando", rotulo: "Aguardando", n: contagens.aguardando },
    { valor: "encerradas", rotulo: "Encerradas", n: contagens.encerradas },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-ink-muted">
          Associados/locatários que não usaram a sala e podem remarcar depois,
          sem data ou sala definidas ainda. Registro de intenção — sem valor
          ou crédito controlado pelo sistema.
        </p>
        <Button size="sm" onClick={() => setAdicionar(true)}>
          <Plus className="size-4" />
          Nova pendência
        </Button>
      </div>

      <div className="flex gap-1.5">
        {abas.map((a) => (
          <button
            key={a.valor}
            type="button"
            onClick={() => router.push(`/admin/pendencias?visao=${a.valor}`)}
            className={
              visao === a.valor
                ? "rounded-full border border-brand bg-brand/10 px-3 py-1 text-xs font-medium text-brand"
                : "rounded-full border px-3 py-1 text-xs text-ink-muted hover:text-ink"
            }
          >
            {a.rotulo} · {a.n}
          </button>
        ))}
      </div>

      {entradas.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-ink-muted">
            Nenhuma pendência nesta visão.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {entradas.map((e) => (
            <EntradaCard
              key={e.id}
              entrada={e}
              aoArquivar={() => setArquivando(e)}
              aoRestaurar={async () => {
                const r = await restaurarPendenciaAction(e.id);
                if ("erro" in r) {
                  toast.error(r.erro);
                  return;
                }
                toast.success("Pendência restaurada.");
                router.refresh();
              }}
            />
          ))}
        </div>
      )}

      {adicionar ? (
        <AdicionarDialog
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
  entrada: EntradaPendencia;
  aoArquivar: () => void;
  aoRestaurar: () => Promise<void>;
}) {
  const [restaurando, setRestaurando] = useState(false);
  const wa = waLink(e);
  const telDigitos = e.contato.replace(/\D/g, "");
  const aguardando = e.situacao === "aguardando";

  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-3">
        <div className="flex items-start justify-between gap-2">
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
          {!aguardando ? (
            <Badge variant={e.situacao === "convertida" ? "secondary" : "outline"}>
              {SITUACAO_PENDENCIA_ROTULO[e.situacao]}
            </Badge>
          ) : null}
        </div>

        {e.motivo ? (
          <p className="text-xs text-ink-muted">Motivo: {e.motivo}</p>
        ) : null}
        {e.observacoes ? (
          <p className="text-xs text-ink-muted">{e.observacoes}</p>
        ) : null}

        <p className="text-xs text-ink-muted">
          Registrada em {dataSP(e.criadoEmUtc)}
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

          {aguardando ? (
            <>
              <Button
                size="sm"
                render={<Link href={`/admin/locacoes/nova?pendencia=${e.id}`} />}
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

          {e.situacao === "arquivada" ? (
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
  entrada: EntradaPendencia;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    setSalvando(true);
    const r = await arquivarPendenciaAction({
      id: entrada.id,
      motivo: motivo || undefined,
    });
    setSalvando(false);
    if ("erro" in r) return toast.error(r.erro);
    toast.success("Pendência arquivada.");
    aoConcluir();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Arquivar pendência</DialogTitle>
          <DialogDescription>
            {entrada.nome} sai da lista sem locar. Reversível a qualquer
            momento. Nada é excluído.
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
  aoFechar,
  aoConcluir,
}: {
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [tipo, setTipo] = useState<"associado" | "externo">("associado");
  const [assoc, setAssoc] = useState<AssociadoBusca | null>(null);
  const [nome, setNome] = useState("");
  const [contato, setContato] = useState("");
  const [motivo, setMotivo] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [salvando, setSalvando] = useState(false);

  function selecionarAssociado(a: AssociadoBusca) {
    setAssoc(a);
    setNome(a.razaoSocial ?? a.nome);
    setContato(mascararTelefone(a.telefone ?? ""));
  }

  async function confirmar() {
    if (!nome.trim() || !contato.trim())
      return toast.error("Informe nome e contato.");
    if (tipo === "associado" && !assoc)
      return toast.error("Selecione o associado ou use 'Externo'.");

    setSalvando(true);
    const r = await adicionarPendenciaAction({
      associadoId: tipo === "associado" ? (assoc?.id ?? null) : null,
      nome: nome.trim(),
      contato: contato.trim(),
      motivo: motivo.trim() || undefined,
      observacoes: observacoes.trim() || undefined,
    });
    setSalvando(false);
    if ("erro" in r) return toast.error(r.erro);
    toast.success("Pendência registrada.");
    aoConcluir();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nova pendência sem data</DialogTitle>
          <DialogDescription>
            Para quando o associado não usou a sala e pode remarcar depois —
            sem data nem sala definidas ainda.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
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
              <Label htmlFor="p-nome">Nome</Label>
              <Input
                id="p-nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="p-contato">Contato (WhatsApp)</Label>
              <Input
                id="p-contato"
                value={contato}
                onChange={(e) => setContato(mascararTelefone(e.target.value))}
                placeholder="(00) 00000-0000"
                inputMode="tel"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-motivo">Motivo</Label>
            <Input
              id="p-motivo"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: evento não realizado, remarcação..."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="p-obs">Observações</Label>
            <Input
              id="p-obs"
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button loading={salvando} onClick={confirmar}>
            Registrar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
