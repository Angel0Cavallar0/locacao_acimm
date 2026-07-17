"use client";

import { Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CONDICOES, DIAS_SEMANA, PERIODOS } from "@/lib/dominio";
import { cn } from "@/lib/utils";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { atualizarSala, criarSala, type EstadoSala } from "./actions";
import type { Equipamento } from "./equipamentos-actions";
import {
  comprimirFoto,
  MAX_FOTOS,
  subirFotoSala,
  TIPOS_FOTO,
} from "./foto-upload";
import { PrecoDialog, type PrecoEntrada } from "./preco-dialog";
import { reajustarPreco } from "./precos-actions";
import { TagSelector } from "./tag-selector";

const rotuloCond = (c: string) =>
  CONDICOES.find((x) => x.valor === c)?.rotulo ?? c;
const rotuloPer = (p: string) =>
  PERIODOS.find((x) => x.valor === p)?.rotulo ?? p;
const diasCurto = (dias: number[]) =>
  DIAS_SEMANA.filter((d) => dias.includes(d.valor))
    .map((d) => d.curto)
    .join(", ");

export interface SalaDados {
  id: string;
  nome: string;
  descricao: string;
  capacidade: number;
  equipamentos: string[];
  ativa: boolean;
}

interface FotoPendente {
  file: File;
  preview: string;
}

const textareaClasses =
  "min-h-16 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function Campos({
  sala,
  equip,
  setEquip,
  catalogo,
}: {
  sala?: SalaDados;
  equip: string[];
  setEquip: (v: string[]) => void;
  catalogo: Equipamento[];
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" defaultValue={sala?.nome} required />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="descricao">Descrição</Label>
        <textarea
          id="descricao"
          name="descricao"
          defaultValue={sala?.descricao}
          rows={3}
          className={textareaClasses}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="capacidade">Capacidade</Label>
        <Input
          id="capacidade"
          name="capacidade"
          type="number"
          min={1}
          defaultValue={sala?.capacidade}
          required
          className="w-32"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Equipamentos</Label>
        <TagSelector value={equip} onChange={setEquip} catalogoInicial={catalogo} />
      </div>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          name="ativa"
          defaultChecked={sala?.ativa ?? true}
          className="size-4"
        />
        Sala ativa (disponível para locação)
      </label>
    </>
  );
}

export function SalaForm({
  modo,
  sala,
  catalogo,
}: {
  modo: "criar" | "editar";
  sala?: SalaDados;
  catalogo: Equipamento[];
}) {
  const router = useRouter();
  const [equip, setEquip] = useState<string[]>(sala?.equipamentos ?? []);

  // -------- Edição (form action) --------
  const [stateEdit, editAction, editPending] = useActionState<
    EstadoSala,
    FormData
  >(atualizarSala, {});
  useEffect(() => {
    if (stateEdit.success) toast.success(stateEdit.success);
  }, [stateEdit.success]);

  // -------- Criação (submit manual: cria sala + fotos + preços pendentes) --------
  const [pendentes, setPendentes] = useState<FotoPendente[]>([]);
  const [precosPendentes, setPrecosPendentes] = useState<PrecoEntrada[]>([]);
  const [comprimindo, setComprimindo] = useState(false);
  const [criando, setCriando] = useState(false);
  const [erroCriar, setErroCriar] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function escolherFotos(files: FileList) {
    if (pendentes.length + files.length > MAX_FOTOS) {
      toast.error(`Máximo de ${MAX_FOTOS} fotos por sala.`);
      return;
    }
    setComprimindo(true);
    const novas: FotoPendente[] = [];
    for (const file of Array.from(files)) {
      if (!TIPOS_FOTO.includes(file.type)) {
        toast.error(`Tipo não suportado: ${file.name}`);
        continue;
      }
      try {
        const c = await comprimirFoto(file);
        novas.push({ file: c, preview: URL.createObjectURL(c) });
      } catch {
        toast.error(`Erro ao processar ${file.name}`);
      }
    }
    setPendentes((prev) => [...prev, ...novas]);
    setComprimindo(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  function removerPendente(i: number) {
    setPendentes((prev) => {
      URL.revokeObjectURL(prev[i].preview);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  async function onSubmitCriar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErroCriar(null);
    setCriando(true);
    const fd = new FormData(e.currentTarget);
    fd.set("equipamentos", JSON.stringify(equip));

    const r = await criarSala({}, fd);
    if (r.error || !r.id) {
      setErroCriar(r.error ?? "Não foi possível criar a sala.");
      setCriando(false);
      return;
    }

    for (const p of pendentes) {
      const up = await subirFotoSala(r.id, p.file);
      if ("error" in up) toast.error(`Foto não enviada: ${up.error}`);
    }
    for (const preco of precosPendentes) {
      const pr = await reajustarPreco({ salaId: r.id, ...preco });
      if (pr.error) toast.error(`Preço não salvo: ${pr.error}`);
    }
    toast.success("Sala criada.");
    router.push(`/admin/salas/${r.id}`);
  }

  if (modo === "editar" && sala) {
    return (
      <Card>
        <CardContent>
          <form action={editAction} className="flex flex-col gap-4" noValidate>
            <input type="hidden" name="id" value={sala.id} />
            <input
              type="hidden"
              name="equipamentos"
              value={JSON.stringify(equip)}
            />
            <Campos
              sala={sala}
              equip={equip}
              setEquip={setEquip}
              catalogo={catalogo}
            />
            {stateEdit.error ? (
              <p role="alert" className="text-sm text-destructive">
                {stateEdit.error}
              </p>
            ) : null}
            <div>
              <Button type="submit" disabled={editPending}>
                {editPending ? "Salvando…" : "Salvar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmitCriar} className="flex flex-col gap-4" noValidate>
          <Campos equip={equip} setEquip={setEquip} catalogo={catalogo} />

          <div className="flex flex-col gap-1.5">
            <Label>Fotos</Label>
            <p className="text-xs text-ink-muted">
              Envie já as fotos (até {MAX_FOTOS}). A primeira é a capa.
            </p>
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={comprimindo || pendentes.length >= MAX_FOTOS}
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="size-4" />
                {comprimindo ? "Processando…" : "Adicionar fotos"}
              </Button>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files?.length) escolherFotos(e.target.files);
                }}
              />
            </div>
            {pendentes.length > 0 ? (
              <div className="mt-1 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {pendentes.map((p, i) => (
                  <div
                    key={p.preview}
                    className="group relative aspect-video overflow-hidden rounded-md border bg-surface-muted"
                  >
                    {/* biome-ignore lint/a11y/useAltText: preview local */}
                    <img
                      src={p.preview}
                      alt={`Prévia ${i + 1}`}
                      className="size-full object-cover"
                    />
                    <button
                      type="button"
                      aria-label="Remover"
                      onClick={() => removerPendente(i)}
                      className="absolute top-1 right-1 rounded bg-black/50 p-0.5 text-white hover:bg-black/70"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <Label>Preços</Label>
                <p className="text-xs text-ink-muted">
                  Adicione os valores por condição, período e dias.
                </p>
              </div>
              <PrecoDialog
                aoSubmeter={(e) => {
                  setPrecosPendentes((prev) => [...prev, e]);
                  return Promise.resolve({});
                }}
              />
            </div>
            {precosPendentes.length > 0 ? (
              <ul className="divide-y rounded-md border">
                {precosPendentes.map((p, i) => (
                  <li
                    key={`${p.condicao}-${p.periodo}-${i}`}
                    className="flex items-center gap-2 px-3 py-2 text-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <span className="font-medium text-ink">
                        {centavosParaBRL(p.valorCentavos)}
                      </span>
                      <span className="text-xs text-ink-muted">
                        {" · "}
                        {rotuloCond(p.condicao)} · {rotuloPer(p.periodo)} ·{" "}
                        {diasCurto(p.diasSemana)}
                      </span>
                    </div>
                    <button
                      type="button"
                      aria-label="Remover preço"
                      onClick={() =>
                        setPrecosPendentes((prev) =>
                          prev.filter((_, idx) => idx !== i),
                        )
                      }
                      className="text-ink-muted hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-muted">
                Nenhum preço adicionado — você também pode cadastrar depois.
              </p>
            )}
          </div>

          {erroCriar ? (
            <p role="alert" className="text-sm text-destructive">
              {erroCriar}
            </p>
          ) : null}
          <div>
            <Button type="submit" disabled={criando || comprimindo}>
              {criando ? "Criando…" : "Criar sala"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
