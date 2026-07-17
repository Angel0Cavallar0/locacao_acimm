"use client";

import { X } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { atualizarSala, criarSala, type EstadoSala } from "./actions";

export interface SalaDados {
  id: string;
  nome: string;
  descricao: string;
  capacidade: number;
  equipamentos: string[];
  ativa: boolean;
}

export function SalaForm({
  modo,
  sala,
}: {
  modo: "criar" | "editar";
  sala?: SalaDados;
}) {
  const action = modo === "criar" ? criarSala : atualizarSala;
  const [state, formAction, pending] = useActionState<EstadoSala, FormData>(
    action,
    {},
  );
  const [equip, setEquip] = useState<string[]>(sala?.equipamentos ?? []);
  const [novo, setNovo] = useState("");

  useEffect(() => {
    if (state.success) toast.success(state.success);
  }, [state.success]);

  function adicionar() {
    const v = novo.trim();
    if (v && !equip.includes(v)) setEquip([...equip, v]);
    setNovo("");
  }

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          {modo === "editar" && sala ? (
            <input type="hidden" name="id" value={sala.id} />
          ) : null}
          <input
            type="hidden"
            name="equipamentos"
            value={JSON.stringify(equip)}
          />

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
              className="min-h-16 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
            <Label htmlFor="equip">Equipamentos</Label>
            <div className="flex gap-2">
              <Input
                id="equip"
                value={novo}
                onChange={(e) => setNovo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    adicionar();
                  }
                }}
                placeholder="Ex.: Projetor, Ar-condicionado"
              />
              <Button type="button" variant="outline" onClick={adicionar}>
                Adicionar
              </Button>
            </div>
            {equip.length > 0 ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {equip.map((eq) => (
                  <span
                    key={eq}
                    className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink"
                  >
                    {eq}
                    <button
                      type="button"
                      aria-label={`Remover ${eq}`}
                      onClick={() => setEquip(equip.filter((x) => x !== eq))}
                      className="text-ink-muted hover:text-ink"
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
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

          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          <div>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Salvando…"
                : modo === "criar"
                  ? "Criar sala"
                  : "Salvar"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
