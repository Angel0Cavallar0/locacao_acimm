"use client";

import { Download, FileSignature, RefreshCw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  regenerarContratoAction,
  reenviarContratoAction,
  urlContratoAdminAction,
} from "@/app/admin/(painel)/contratos/actions";
import { Button } from "@/components/ui/button";

/** Ações de contrato no detalhe da locação (Spec 13 §3/§6). */
export function ContratoAcoes({
  locacaoId,
  temContrato,
  temPdf,
  assinado,
}: {
  locacaoId: string;
  temContrato: boolean;
  temPdf: boolean;
  assinado: boolean;
}) {
  const router = useRouter();
  const [acao, setAcao] = useState<"baixar" | "gerar" | "reenviar" | null>(null);

  async function baixar() {
    setAcao("baixar");
    const r = await urlContratoAdminAction(locacaoId);
    setAcao(null);
    if (r.error) return toast.error(r.error);
    if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
  }

  async function gerar() {
    setAcao("gerar");
    const r = await regenerarContratoAction(locacaoId);
    setAcao(null);
    if (r.error) return toast.error(r.error);
    toast.success(temContrato ? "Contrato regenerado." : "Contrato gerado.");
    if (r.aviso) toast.warning(r.aviso);
    router.refresh();
  }

  async function reenviar() {
    setAcao("reenviar");
    const r = await reenviarContratoAction(locacaoId);
    setAcao(null);
    if (r.error) return toast.error(r.error);
    toast.success(r.aviso ?? "Contrato reenviado.");
    router.refresh();
  }

  return (
    <div className="flex flex-wrap gap-2">
      {temPdf ? (
        <Button
          variant="outline"
          size="sm"
          loading={acao === "baixar"}
          disabled={acao !== null}
          onClick={baixar}
        >
          <Download className="size-4" />
          Baixar
        </Button>
      ) : null}
      {!assinado ? (
        <Button
          variant="outline"
          size="sm"
          loading={acao === "gerar"}
          disabled={acao !== null}
          onClick={gerar}
        >
          {temContrato ? (
            <RefreshCw className="size-4" />
          ) : (
            <FileSignature className="size-4" />
          )}
          {temContrato ? "Regenerar" : "Gerar contrato"}
        </Button>
      ) : null}
      {temContrato && !assinado ? (
        <Button
          variant="ghost"
          size="sm"
          loading={acao === "reenviar"}
          disabled={acao !== null}
          onClick={reenviar}
        >
          <Send className="size-4" />
          Reenviar
        </Button>
      ) : null}
    </div>
  );
}
