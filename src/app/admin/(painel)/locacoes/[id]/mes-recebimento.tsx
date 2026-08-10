"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { salvarMesRecebimentoAction } from "../actions";

/**
 * Mês do recebimento (Spec 33 §8). É o que define a competência da comissão —
 * por isso fica junto dos pagamentos, onde a equipe está quando dá a baixa.
 * Preenchido automaticamente na geração da comissão e editável aqui.
 */
export function MesRecebimento({
  locacaoId,
  inicial,
}: {
  locacaoId: string;
  /** 'YYYY-MM' ou null. */
  inicial: string | null;
}) {
  const [mes, setMes] = useState(inicial ?? "");
  const [salvo, setSalvo] = useState(inicial ?? "");
  const [salvando, setSalvando] = useState(false);

  async function salvar(valor: string) {
    setSalvando(true);
    const r = await salvarMesRecebimentoAction({
      locacaoId,
      mes: valor.length > 0 ? valor : null,
    });
    setSalvando(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setSalvo(valor);
    setMes(valor);
    if (r.aviso) toast.warning(r.aviso);
    else toast.success("Mês do recebimento salvo.");
  }

  return (
    <div className="mb-3 rounded-lg border bg-surface-muted/40 p-3">
      <p className="text-xs font-medium text-ink">
        Mês do recebimento · define a competência da comissão
      </p>
      <p className="mt-0.5 text-xs text-ink-muted">
        {salvo.length === 0
          ? "Ainda não informado — será preenchido pela baixa do pagamento."
          : "Preenchido pela baixa do pagamento; ajuste se o valor entrar em outro mês."}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="month"
          value={mes}
          onChange={(e) => setMes(e.target.value)}
          aria-label="Mês do recebimento"
          className="rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <Button
          size="sm"
          variant="outline"
          loading={salvando}
          disabled={salvando || mes === salvo}
          onClick={() => salvar(mes)}
        >
          Salvar
        </Button>
        {salvo.length > 0 ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={salvando}
            onClick={() => salvar("")}
          >
            Limpar
          </Button>
        ) : null}
      </div>
    </div>
  );
}
