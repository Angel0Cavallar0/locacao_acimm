"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { salvarObservacoesInternasAction } from "../actions";

/**
 * Editor das observações internas da locação (Spec 32 §3.4). Visível só à
 * equipe; o texto nunca é carregado no portal do associado.
 */
export function ObservacoesInternas({
  locacaoId,
  inicial,
}: {
  locacaoId: string;
  inicial: string | null;
}) {
  const [texto, setTexto] = useState(inicial ?? "");
  const [salvo, setSalvo] = useState(inicial ?? "");
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const r = await salvarObservacoesInternasAction({ locacaoId, texto });
    setSalvando(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    setSalvo(texto);
    toast.success("Observações internas salvas.");
  }

  return (
    <div className="border-t pt-2">
      <p className="mb-1 text-xs font-medium text-ink-muted">
        Observações internas · só a equipe vê
      </p>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        rows={3}
        placeholder="Anotações da equipe fora do formulário…"
        className="w-full rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      />
      <div className="mt-1 flex justify-end">
        <Button
          size="sm"
          variant="outline"
          loading={salvando}
          disabled={salvando || texto === salvo}
          onClick={salvar}
        >
          Salvar observações
        </Button>
      </div>
    </div>
  );
}
