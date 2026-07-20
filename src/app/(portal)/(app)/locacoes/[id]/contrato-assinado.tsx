"use client";

import { FileCheck2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { removerContratoAssinado, urlContratoAssinado } from "./actions";
import {
  subirContratoAssinado,
  TIPOS_CONTRATO,
} from "./contrato-assinado-upload";

/**
 * Envio do contrato assinado pelo associado (revisão Spec 13). Disponível
 * enquanto o contrato está "aguardando assinatura"; a ACIMM confere e aprova.
 */
export function ContratoAssinado({
  locacaoId,
  assinadoEnviado,
}: {
  locacaoId: string;
  assinadoEnviado: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [abrindo, setAbrindo] = useState(false);

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setEnviando(true);
    const r = await subirContratoAssinado(locacaoId, file);
    setEnviando(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    toast.success("Contrato assinado enviado.");
    router.refresh();
  }

  async function abrir() {
    setAbrindo(true);
    const r = await urlContratoAssinado(locacaoId);
    setAbrindo(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    window.open(r.url, "_blank", "noopener,noreferrer");
  }

  async function remover() {
    setEnviando(true);
    const r = await removerContratoAssinado({ locacaoId });
    setEnviando(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success("Contrato assinado removido.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 border-t pt-3">
      {assinadoEnviado ? (
        <>
          <span className="flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
            <FileCheck2 className="size-3.5" />
            Contrato assinado enviado — aguardando conferência da ACIMM.
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={abrindo}
              onClick={abrir}
            >
              Ver enviado
            </Button>
            <Button
              variant="ghost"
              size="sm"
              loading={enviando}
              onClick={() => inputRef.current?.click()}
            >
              Substituir
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={enviando}
              onClick={remover}
            >
              Remover
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-ink-muted">
            Já assinou? Envie o contrato assinado para a ACIMM conferir e
            aprovar.
          </p>
          <Button
            variant="outline"
            size="sm"
            loading={enviando}
            onClick={() => inputRef.current?.click()}
            className="self-start"
          >
            <Upload className="size-4" />
            Enviar contrato assinado
          </Button>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept={TIPOS_CONTRATO.join(",")}
        className="hidden"
        onChange={aoEscolher}
      />
    </div>
  );
}
