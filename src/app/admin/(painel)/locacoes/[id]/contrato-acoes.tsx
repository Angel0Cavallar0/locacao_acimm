"use client";

import {
  Download,
  FileCheck2,
  FileSignature,
  RefreshCw,
  Send,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  regenerarContratoAction,
  reenviarContratoAction,
  urlContratoAdminAction,
  urlContratoAssinadoAdminAction,
} from "@/app/admin/(painel)/contratos/actions";
import { Button } from "@/components/ui/button";

/** Ações de contrato no detalhe da locação (Spec 13 §3/§6). */
export function ContratoAcoes({
  locacaoId,
  temContrato,
  temPdf,
  temAssinado,
  assinado,
}: {
  locacaoId: string;
  temContrato: boolean;
  temPdf: boolean;
  temAssinado: boolean;
  assinado: boolean;
}) {
  const router = useRouter();
  const [acao, setAcao] = useState<
    "baixar" | "assinado" | "gerar" | "reenviar" | null
  >(null);

  async function baixar() {
    setAcao("baixar");
    const r = await urlContratoAdminAction(locacaoId);
    setAcao(null);
    if (r.error) return toast.error(r.error);
    if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
  }

  async function baixarAssinado() {
    setAcao("assinado");
    const r = await urlContratoAssinadoAdminAction(locacaoId);
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
      {temAssinado ? (
        <Button
          variant="outline"
          size="sm"
          loading={acao === "assinado"}
          disabled={acao !== null}
          onClick={baixarAssinado}
        >
          <FileCheck2 className="size-4" />
          Baixar assinado
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
