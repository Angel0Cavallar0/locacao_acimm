"use client";

import {
  Download,
  FileCheck2,
  FileSignature,
  RefreshCw,
  Send,
  Upload,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  regenerarContratoAction,
  reenviarContratoAction,
  urlContratoAdminAction,
  urlContratoAssinadoAdminAction,
} from "@/app/admin/(painel)/contratos/actions";
import { Button } from "@/components/ui/button";
import { subirContratoAssinadoAdmin } from "./contrato-assinado-upload";

/** Ações de contrato no detalhe da locação (Spec 13 §3/§6). */
export function ContratoAcoes({
  locacaoId,
  temContrato,
  temPdf,
  temAssinado,
  assinado,
  statusContrato,
}: {
  locacaoId: string;
  temContrato: boolean;
  temPdf: boolean;
  temAssinado: boolean;
  assinado: boolean;
  statusContrato?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [acao, setAcao] = useState<
    "baixar" | "assinado" | "gerar" | "reenviar" | "anexar" | null
  >(null);
  const podeAnexarAssinado = statusContrato === "enviado" && !temAssinado;

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

  async function aoEscolherAssinado(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAcao("anexar");
    const r = await subirContratoAssinadoAdmin(locacaoId, file);
    setAcao(null);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    toast.success("Contrato assinado anexado — locação marcada como assinada.");
    if (r.aviso) toast.warning(r.aviso);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      {podeAnexarAssinado ? (
        <p className="text-xs text-ink-muted">
          Associado assinou presencialmente? Anexe o PDF escaneado — a
          locação já é marcada como assinada.
        </p>
      ) : null}
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
        {podeAnexarAssinado ? (
          <Button
            variant="outline"
            size="sm"
            loading={acao === "anexar"}
            disabled={acao !== null}
            onClick={() => inputRef.current?.click()}
          >
            <Upload className="size-4" />
            Anexar contrato assinado
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
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={aoEscolherAssinado}
      />
    </div>
  );
}
