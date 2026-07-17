"use client";

import { ChevronDown, Plus, Trash2, X } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  criarEquipamento,
  type Equipamento,
  removerEquipamento,
} from "./equipamentos-actions";

export function TagSelector({
  value,
  onChange,
  catalogoInicial,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  catalogoInicial: Equipamento[];
}) {
  const [catalogo, setCatalogo] = useState<Equipamento[]>(catalogoInicial);
  const [aberto, setAberto] = useState(false);
  const [novo, setNovo] = useState("");
  const [delAlvo, setDelAlvo] = useState<Equipamento | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(nome: string) {
    onChange(
      value.includes(nome) ? value.filter((x) => x !== nome) : [...value, nome],
    );
  }

  function criar() {
    const nome = novo.trim();
    if (!nome) return;
    startTransition(async () => {
      const r = await criarEquipamento(nome);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setCatalogo((prev) =>
        prev.some((e) => e.id === r.id)
          ? prev
          : [...prev, r].sort((a, b) => a.nome.localeCompare(b.nome)),
      );
      if (!value.includes(r.nome)) onChange([...value, r.nome]);
      setNovo("");
    });
  }

  function confirmarRemocao() {
    const alvo = delAlvo;
    if (!alvo) return;
    startTransition(async () => {
      const r = await removerEquipamento(alvo.id);
      if (r.error) {
        toast.error(r.error);
      } else {
        setCatalogo((prev) => prev.filter((e) => e.id !== alvo.id));
        onChange(value.filter((x) => x !== alvo.nome));
        toast.success("Tag removida.");
      }
      setDelAlvo(null);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {value.map((nome) => (
            <span
              key={nome}
              className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2.5 py-1 text-xs text-ink"
            >
              {nome}
              <button
                type="button"
                aria-label={`Remover ${nome}`}
                onClick={() => toggle(nome)}
                className="text-ink-muted hover:text-ink"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <div className="w-full max-w-sm">
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          className="flex w-full items-center justify-between rounded-lg border border-input px-3 py-2 text-sm text-ink-muted hover:bg-surface-muted"
        >
          Selecionar equipamentos
          <ChevronDown
            className={cn("size-4 transition-transform", aberto && "rotate-180")}
          />
        </button>

        {aberto ? (
          <div className="mt-1 rounded-md border bg-popover p-2 shadow-sm">
            <div className="flex gap-2">
              <Input
                value={novo}
                onChange={(e) => setNovo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    criar();
                  }
                }}
                placeholder="Nova tag"
                className="h-8"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={criar}
                disabled={pending}
              >
                <Plus className="size-4" />
              </Button>
            </div>

            <ul className="mt-2 max-h-48 overflow-auto">
              {catalogo.length === 0 ? (
                <li className="px-1 py-2 text-xs text-ink-muted">
                  Nenhuma tag criada ainda.
                </li>
              ) : (
                catalogo.map((eq) => (
                  <li
                    key={eq.id}
                    className="flex items-center justify-between gap-2 rounded px-1 py-1 hover:bg-surface-muted"
                  >
                    <label className="flex flex-1 cursor-pointer items-center gap-2 text-sm text-ink">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={value.includes(eq.nome)}
                        onChange={() => toggle(eq.nome)}
                      />
                      {eq.nome}
                    </label>
                    <button
                      type="button"
                      aria-label={`Excluir ${eq.nome}`}
                      onClick={() => setDelAlvo(eq)}
                      className="text-ink-muted hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : null}
      </div>

      <AlertDialog
        open={delAlvo !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setDelAlvo(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a tag “{delAlvo?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela será removida do catálogo e de todas as salas que a utilizam.
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={pending}
              onClick={confirmarRemocao}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
