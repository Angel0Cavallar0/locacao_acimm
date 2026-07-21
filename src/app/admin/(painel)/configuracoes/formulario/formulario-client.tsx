"use client";

import { ChevronDown, ChevronUp, Eye, Pencil, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CamposDinamicos,
  type CampoDinamico,
} from "@/components/locacoes/campos-dinamicos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  exigeOpcoes,
  type RespostaValor,
  TIPO_ROTULO,
  TIPOS_CAMPO,
  type TipoCampo,
} from "@/lib/formulario/campos-core";
import type { CampoGestao } from "@/lib/formulario/dados";
import {
  alternarAtivoCampoAction,
  criarCampoAction,
  editarCampoAction,
  opcoesEmUsoAction,
  reordenarCampoAction,
} from "./actions";

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

const LIMITE_ATIVOS = 15;

/** Editor de linhas de opção (seleção/multiseleção). */
function OpcoesEditor({
  opcoes,
  aoMudar,
  emUso,
}: {
  opcoes: string[];
  aoMudar: (v: string[]) => void;
  emUso: Set<string>;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label>Opções (mín. 2)</Label>
      {opcoes.map((o, i) => {
        const usada = emUso.has(o.trim());
        return (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={o}
              onChange={(e) => {
                const nova = [...opcoes];
                nova[i] = e.target.value;
                aoMudar(nova);
              }}
              placeholder={`Opção ${i + 1}`}
              className="h-9"
            />
            {usada ? (
              <span className="whitespace-nowrap text-[11px] text-amber-700 dark:text-amber-400">
                em uso
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => aoMudar(opcoes.filter((_, j) => j !== i))}
              className="text-ink-muted hover:text-ink"
              aria-label="Remover opção"
            >
              <X className="size-4" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        onClick={() => aoMudar([...opcoes, ""])}
        className="inline-flex w-fit items-center gap-1 text-xs text-brand hover:underline"
      >
        <Plus className="size-3" />
        Adicionar opção
      </button>
    </div>
  );
}

function CampoDialog({
  inicial,
  aoFechar,
  aoConcluir,
}: {
  inicial: CampoGestao | null;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const editando = inicial !== null;
  const [rotulo, setRotulo] = useState(inicial?.rotulo ?? "");
  const [tipo, setTipo] = useState<TipoCampo>(inicial?.tipo ?? "texto");
  const [opcoes, setOpcoes] = useState<string[]>(
    inicial?.opcoes.length ? inicial.opcoes : ["", ""],
  );
  const [obrigatorio, setObrigatorio] = useState(inicial?.obrigatorio ?? false);
  const [ativo, setAtivo] = useState(inicial?.ativo ?? true);
  const [emUso, setEmUso] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);

  // Opções realmente usadas (aviso ao remover — §3), só ao editar seleção.
  useEffect(() => {
    if (editando && exigeOpcoes(tipo) && inicial) {
      opcoesEmUsoAction(inicial.id).then((us) => setEmUso(new Set(us)));
    }
  }, [editando, tipo, inicial]);

  async function salvar() {
    if (!rotulo.trim()) return toast.error("Informe o rótulo.");
    const opcoesLimpas = opcoes.map((o) => o.trim()).filter(Boolean);
    if (exigeOpcoes(tipo) && new Set(opcoesLimpas).size < 2) {
      return toast.error("Seleção e multiseleção exigem ao menos 2 opções.");
    }
    setSalvando(true);
    const r = editando
      ? await editarCampoAction({
          id: inicial.id,
          rotulo,
          opcoes: opcoesLimpas,
          obrigatorio,
          ativo,
        })
      : await criarCampoAction({
          rotulo,
          tipo,
          opcoes: opcoesLimpas,
          obrigatorio,
          ativo,
        });
    setSalvando(false);
    if ("erro" in r) return toast.error(r.erro);
    toast.success(editando ? "Campo atualizado." : "Campo criado.");
    aoConcluir();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar campo" : "Novo campo"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-rotulo">Rótulo (pergunta)</Label>
            <Input
              id="c-rotulo"
              value={rotulo}
              onChange={(e) => setRotulo(e.target.value)}
              placeholder="Ex.: O evento terá venda de ingressos?"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="c-tipo">Tipo</Label>
            {editando ? (
              <p className="text-sm text-ink-muted">
                {TIPO_ROTULO[tipo]}{" "}
                <span className="text-xs">
                  (o tipo não muda — desative e crie outro se precisar)
                </span>
              </p>
            ) : (
              <select
                id="c-tipo"
                className={inputClasses}
                value={tipo}
                onChange={(e) => setTipo(e.target.value as TipoCampo)}
              >
                {TIPOS_CAMPO.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_ROTULO[t]}
                  </option>
                ))}
              </select>
            )}
          </div>

          {exigeOpcoes(tipo) ? (
            <OpcoesEditor opcoes={opcoes} aoMudar={setOpcoes} emUso={emUso} />
          ) : null}

          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={obrigatorio}
              onChange={(e) => setObrigatorio(e.target.checked)}
            />
            <span className="text-sm text-ink">Resposta obrigatória</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
            />
            <span className="text-sm text-ink">
              Ativo (aparece no formulário)
            </span>
          </label>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button loading={salvando} onClick={salvar}>
            Salvar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function FormularioClient({
  campos,
  ativosPreview,
}: {
  campos: CampoGestao[];
  ativosPreview: CampoDinamico[];
}) {
  const router = useRouter();
  const [adicionando, setAdicionando] = useState(false);
  const [editando, setEditando] = useState<CampoGestao | null>(null);
  const [previewValores, setPreviewValores] = useState<
    Record<string, RespostaValor>
  >({});

  const ativos = campos.filter((c) => c.ativo).length;
  const noLimite = ativos >= LIMITE_ATIVOS;

  async function mover(id: string, direcao: "cima" | "baixo") {
    const r = await reordenarCampoAction({ id, direcao });
    if ("erro" in r) return toast.error(r.erro);
    router.refresh();
  }

  async function alternar(campo: CampoGestao) {
    const r = await alternarAtivoCampoAction({
      id: campo.id,
      ativo: !campo.ativo,
    });
    if ("erro" in r) return toast.error(r.erro);
    router.refresh();
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      {/* Coluna: lista + adicionar */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-ink-muted">
            {ativos}/{LIMITE_ATIVOS} campos ativos
          </span>
          <Button size="sm" disabled={noLimite} onClick={() => setAdicionando(true)}>
            <Plus className="size-4" />
            Novo campo
          </Button>
        </div>
        {noLimite ? (
          <p className="text-xs text-amber-700 dark:text-amber-400">
            Limite de {LIMITE_ATIVOS} campos ativos atingido. Desative um para
            adicionar outro.
          </p>
        ) : null}

        {campos.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-sm text-ink-muted">
              Nenhum campo cadastrado. O formulário do associado terá apenas os
              campos fixos.
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-2">
            {campos.map((c, i) => (
              <Card key={c.id} className={c.ativo ? "" : "opacity-60"}>
                <CardContent className="flex items-center gap-2 p-3">
                  <div className="flex flex-col">
                    <button
                      type="button"
                      disabled={i === 0}
                      onClick={() => mover(c.id, "cima")}
                      className="text-ink-muted hover:text-ink disabled:opacity-30"
                      aria-label="Mover para cima"
                    >
                      <ChevronUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      disabled={i === campos.length - 1}
                      onClick={() => mover(c.id, "baixo")}
                      className="text-ink-muted hover:text-ink disabled:opacity-30"
                      aria-label="Mover para baixo"
                    >
                      <ChevronDown className="size-4" />
                    </button>
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">
                      {c.rotulo}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{TIPO_ROTULO[c.tipo]}</Badge>
                      {c.obrigatorio ? (
                        <Badge variant="secondary">Obrigatório</Badge>
                      ) : null}
                      {!c.ativo ? <Badge variant="outline">Inativo</Badge> : null}
                      <span className="text-[11px] text-ink-muted">
                        {c.totalRespostas} resposta
                        {c.totalRespostas === 1 ? "" : "s"}
                      </span>
                    </div>
                  </div>

                  <label className="flex cursor-pointer items-center gap-1 text-xs text-ink-muted">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={c.ativo}
                      onChange={() => alternar(c)}
                    />
                    Ativo
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditando(c)}
                  >
                    <Pencil className="size-4" />
                    Editar
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Coluna: preview ao vivo (mesmo componente do portal — §2) */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardContent className="flex flex-col gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Eye className="size-4" />
              Pré-visualização
            </p>
            <p className="text-xs text-ink-muted">
              Exatamente como o associado vê ao solicitar.
            </p>
            {ativosPreview.length === 0 ? (
              <p className="py-4 text-center text-xs text-ink-muted">
                Nenhum campo ativo.
              </p>
            ) : (
              <CamposDinamicos
                campos={ativosPreview}
                valores={previewValores}
                onChange={(id, valor) =>
                  setPreviewValores((v) => ({ ...v, [id]: valor }))
                }
              />
            )}
          </CardContent>
        </Card>
      </div>

      {adicionando ? (
        <CampoDialog
          inicial={null}
          aoFechar={() => setAdicionando(false)}
          aoConcluir={() => {
            setAdicionando(false);
            router.refresh();
          }}
        />
      ) : null}
      {editando ? (
        <CampoDialog
          inicial={editando}
          aoFechar={() => setEditando(null)}
          aoConcluir={() => {
            setEditando(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
