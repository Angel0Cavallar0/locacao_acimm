"use client";

import { FileDown } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { exportarMesPdfAction } from "./relatorio-actions";

/**
 * Botão "Exportar mês em PDF" (Spec 32 §1.4). Chama a action, decodifica o
 * base64 e dispara o download no client — mesmo padrão do PDF de coffee.
 */
export function ExportarMesButton({
  deISO,
  ateISO,
}: {
  deISO: string;
  ateISO: string;
}) {
  const [gerando, setGerando] = useState(false);

  async function gerar() {
    setGerando(true);
    const r = await exportarMesPdfAction({ deISO, ateISO });
    setGerando(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    const bin = atob(r.base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = r.nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button
      size="sm"
      variant="outline"
      loading={gerando}
      disabled={gerando}
      onClick={gerar}
    >
      <FileDown className="size-4" /> Exportar PDF
    </Button>
  );
}
