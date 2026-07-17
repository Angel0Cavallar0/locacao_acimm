"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TIPOS_COMBO, type TipoCombo } from "@/lib/dominio";
import { cn } from "@/lib/utils";
import { alternarAtivoCombo } from "./combos-actions";

export interface ComboCard {
  id: string;
  nome: string;
  tipo: TipoCombo;
  ativo: boolean;
  resumo: string;
}

export function ComboLista({ combos }: { combos: ComboCard[] }) {
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function alternar(c: ComboCard) {
    setPendingId(c.id);
    startTransition(async () => {
      const r = await alternarAtivoCombo(c.id, !c.ativo);
      if (r.error) toast.error(r.error);
      else toast.success(c.ativo ? "Combo desativado." : "Combo ativado.");
      setPendingId(null);
    });
  }

  const rotuloTipo = (t: TipoCombo) =>
    TIPOS_COMBO.find((x) => x.valor === t)?.rotulo ?? t;

  return (
    <div className="mx-auto mt-10 max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">Combos</h2>
          <p className="text-sm text-ink-muted">
            Pacotes: desconto multi-sala, assinatura mensal e evento privativo.
          </p>
        </div>
        <Link href="/admin/salas/combos/novo" className={buttonVariants()}>
          <Plus className="size-4" />
          Criar combo
        </Link>
      </div>

      {combos.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-ink-muted">
            Nenhum combo criado ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {combos.map((c) => (
            <Card
              key={c.id}
              className={cn(isPending && pendingId === c.id && "opacity-60")}
            >
              <CardContent className="flex items-center gap-4">
                <Link
                  href={`/admin/salas/combos/${c.id}`}
                  className="min-w-0 flex-1"
                >
                  <div className="flex items-center gap-2">
                    <h3 className="truncate font-medium text-ink">{c.nome}</h3>
                    <Badge variant={c.ativo ? "default" : "outline"}>
                      {c.ativo ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {rotuloTipo(c.tipo)} · {c.resumo}
                  </p>
                </Link>
                <Button
                  variant={c.ativo ? "ghost" : "outline"}
                  size="sm"
                  disabled={isPending && pendingId === c.id}
                  onClick={() => alternar(c)}
                >
                  {c.ativo ? "Desativar" : "Ativar"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
