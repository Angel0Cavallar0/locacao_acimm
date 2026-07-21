"use client";

import { Pencil, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dataSP } from "@/lib/calendario/tempo";
import { PERIODOS } from "@/lib/dominio";
import type { RegraGratuitoLinha } from "@/lib/periodo-gratuito/regras";
import { criarRegraAction, editarRegraAction } from "./actions";

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function rotuloPeriodo(v: string): string {
  return PERIODOS.find((p) => p.valor === v)?.rotulo ?? v;
}

/** Grade de checkboxes de período (reutilizada em criar/editar). */
function SeletorPeriodos({
  selecionados,
  aoMudar,
}: {
  selecionados: string[];
  aoMudar: (v: string[]) => void;
}) {
  function alternar(v: string) {
    aoMudar(
      selecionados.includes(v)
        ? selecionados.filter((x) => x !== v)
        : [...selecionados, v],
    );
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {PERIODOS.map((p) => (
        <button
          key={p.valor}
          type="button"
          onClick={() => alternar(p.valor)}
          className={
            selecionados.includes(p.valor)
              ? "rounded-full border border-brand bg-brand/10 px-3 py-1 text-xs font-medium text-brand"
              : "rounded-full border px-3 py-1 text-xs text-ink-muted hover:text-ink"
          }
        >
          {p.rotulo}
        </button>
      ))}
    </div>
  );
}

export function PeriodoGratuitoClient({
  regras,
  salasSemRegra,
}: {
  regras: RegraGratuitoLinha[];
  salasSemRegra: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState<RegraGratuitoLinha | null>(null);

  // Form de adicionar.
  const [salaId, setSalaId] = useState("");
  const [periodos, setPeriodos] = useState<string[]>([]);
  const [usos, setUsos] = useState("1");
  const [salvando, setSalvando] = useState(false);

  async function adicionar() {
    if (!salaId) return toast.error("Selecione a sala.");
    if (periodos.length === 0) return toast.error("Escolha ao menos um período.");
    setSalvando(true);
    const r = await criarRegraAction({
      salaId,
      periodos,
      usosPorCiclo: Number(usos) || 1,
    });
    setSalvando(false);
    if ("erro" in r) return toast.error(r.erro);
    toast.success("Regra criada.");
    setSalaId("");
    setPeriodos([]);
    setUsos("1");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Adicionar */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink">Adicionar regra</h3>
          {salasSemRegra.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Todas as salas ativas já têm regra. Edite as existentes abaixo.
            </p>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="sala">Sala</Label>
                  <select
                    id="sala"
                    className={inputClasses}
                    value={salaId}
                    onChange={(e) => setSalaId(e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {salasSemRegra.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nome}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="usos">Usos por ciclo (mês)</Label>
                  <Input
                    id="usos"
                    type="number"
                    min={1}
                    value={usos}
                    onChange={(e) => setUsos(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Períodos elegíveis</Label>
                <SeletorPeriodos selecionados={periodos} aoMudar={setPeriodos} />
              </div>
              <Button className="w-fit" loading={salvando} onClick={adicionar}>
                <Plus className="size-4" />
                Adicionar regra
              </Button>
            </>
          )}
        </CardContent>
      </Card>

      {/* Lista */}
      {regras.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-ink-muted">
            Nenhuma regra cadastrada. Sem regra, a sala simplesmente não tem
            período gratuito.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {regras.map((r) => (
            <Card key={r.id}>
              <CardContent className="flex flex-col gap-2 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 text-sm font-medium text-ink">
                      {r.salaNome}
                      {r.ativo ? (
                        <Badge variant="secondary">Ativa</Badge>
                      ) : (
                        <Badge variant="outline">Inativa</Badge>
                      )}
                    </p>
                    <p className="mt-1 flex flex-wrap gap-1 text-xs text-ink-muted">
                      {r.periodos.map((p) => (
                        <span
                          key={p}
                          className="rounded-full bg-surface-muted px-2 py-0.5"
                        >
                          {rotuloPeriodo(p)}
                        </span>
                      ))}
                      <span className="px-1">· {r.usosPorCiclo}/ciclo</span>
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditando(r)}
                  >
                    <Pencil className="size-4" />
                    Editar
                  </Button>
                </div>
                <p className="text-xs text-ink-muted">
                  Última alteração {dataSP(r.atualizadoEmUtc)}
                  {r.atualizadoPorNome ? ` · ${r.atualizadoPorNome}` : ""}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editando ? (
        <EditarDialog
          regra={editando}
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

function EditarDialog({
  regra,
  aoFechar,
  aoConcluir,
}: {
  regra: RegraGratuitoLinha;
  aoFechar: () => void;
  aoConcluir: () => void;
}) {
  const [periodos, setPeriodos] = useState<string[]>(regra.periodos);
  const [usos, setUsos] = useState(String(regra.usosPorCiclo));
  const [ativo, setAtivo] = useState(regra.ativo);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (periodos.length === 0) return toast.error("Escolha ao menos um período.");
    setSalvando(true);
    const r = await editarRegraAction({
      id: regra.id,
      periodos,
      usosPorCiclo: Number(usos) || 1,
      ativo,
    });
    setSalvando(false);
    if ("erro" in r) return toast.error(r.erro);
    toast.success("Regra atualizada.");
    aoConcluir();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{regra.salaNome}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Períodos elegíveis</Label>
            <SeletorPeriodos selecionados={periodos} aoMudar={setPeriodos} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="e-usos">Usos por ciclo (mês)</Label>
            <Input
              id="e-usos"
              type="number"
              min={1}
              value={usos}
              onChange={(e) => setUsos(e.target.value)}
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="size-4"
              checked={ativo}
              onChange={(e) => setAtivo(e.target.checked)}
            />
            <span className="text-sm text-ink">Regra ativa</span>
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
