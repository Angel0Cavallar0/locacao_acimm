"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { FiltroVisaoComissoesInput } from "@/lib/validacoes/comissoes";
import { exportarComissoesAction } from "./actions";

/**
 * Exporta o CSV da visão atual (Ciclo 2 / §5). Somente leitura — não altera
 * nenhuma comissão (o controle pago/não-pago é ação própria na tabela). O
 * download é disparado no cliente a partir do conteúdo retornado pela action.
 */
export function ExportarBotao({
  filtros,
  vazio,
}: {
  filtros: FiltroVisaoComissoesInput;
  vazio: boolean;
}) {
  const [gerando, setGerando] = useState(false);

  async function exportar() {
    setGerando(true);
    const r = await exportarComissoesAction(filtros);
    setGerando(false);
    if ("erro" in r) return toast.error(r.erro);
    if (r.linhas === 0) {
      toast.info("Nenhuma comissão nesta visão.");
      return;
    }

    const blob = new Blob([r.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = r.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(`${r.linhas} linha(s) exportada(s).`);
  }

  return (
    <Button
      variant="outline"
      size="sm"
      disabled={vazio || gerando}
      loading={gerando}
      onClick={exportar}
    >
      <Download className="size-4" />
      Exportar CSV
    </Button>
  );
}
