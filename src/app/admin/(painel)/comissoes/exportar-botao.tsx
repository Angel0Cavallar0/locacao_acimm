"use client";

import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { exportarComissoesAction } from "./actions";

export interface FiltrosExport {
  competencia: string | null;
  origem: "locacao" | "coffee" | null;
  status:
    | "pendentes"
    | "exportadas"
    | "estornadas"
    | "estornadas_exportadas"
    | null;
  busca: string | null;
}

/**
 * Exporta o CSV do recorte atual (Spec 21 §5). Confirma antes, porque a ação
 * marca as comissões incluídas como exportadas. O download é disparado no
 * cliente a partir do conteúdo retornado pela action.
 */
export function ExportarBotao({
  filtros,
  vazio,
}: {
  filtros: FiltrosExport;
  vazio: boolean;
}) {
  const router = useRouter();
  const [gerando, setGerando] = useState(false);

  async function exportar() {
    setGerando(true);
    const r = await exportarComissoesAction(filtros);
    setGerando(false);
    if ("erro" in r) return toast.error(r.erro);

    if (r.linhas === 0) {
      toast.info("Nenhuma comissão (não estornada) neste recorte.");
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

    toast.success(
      r.marcadas > 0
        ? `${r.linhas} linha(s) exportada(s); ${r.marcadas} marcada(s) como exportada(s).`
        : `${r.linhas} linha(s) exportada(s).`,
    );
    router.refresh();
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button variant="outline" size="sm" disabled={vazio}>
            <Download className="size-4" />
            Exportar CSV
          </Button>
        }
      />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Exportar comissões</AlertDialogTitle>
          <AlertDialogDescription>
            Gera o CSV das comissões não estornadas deste filtro e marca as
            incluídas como <strong>exportadas</strong>. Estornadas nunca entram.
            Você pode re-exportar as já exportadas quando quiser.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={gerando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction loading={gerando} onClick={exportar}>
            Gerar e baixar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
