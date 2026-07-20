"use client";

import { Download, RefreshCw, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { rotuloLocacao } from "@/lib/locacoes/tipos";
import { cn } from "@/lib/utils";
import {
  regenerarContratoAction,
  reenviarContratoAction,
  urlContratoAdminAction,
} from "./actions";

export interface ContratoLinha {
  locacaoId: string;
  numero: number;
  locatario: string;
  dataEvento: string;
  statusContrato: string;
  temPdf: boolean;
  enviadoEm: string | null;
  assinadoEm: string | null;
}

const STATUS: Record<string, { rotulo: string; classe: string }> = {
  pendente: {
    rotulo: "Pendente",
    classe: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  },
  enviado: {
    rotulo: "Enviado",
    classe: "bg-brand/10 text-brand",
  },
  assinado: {
    rotulo: "Assinado",
    classe: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  },
  recusado: {
    rotulo: "Recusado",
    classe: "bg-destructive/10 text-destructive",
  },
  cancelado: {
    rotulo: "Cancelado",
    classe: "bg-surface-muted text-ink-muted",
  },
};

export function ContratosClient({
  contratos,
}: {
  contratos: ContratoLinha[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {contratos.map((c) => (
        <ContratoCard key={c.locacaoId} contrato={c} />
      ))}
    </div>
  );
}

function ContratoCard({ contrato }: { contrato: ContratoLinha }) {
  const router = useRouter();
  const [acao, setAcao] = useState<"baixar" | "regenerar" | "reenviar" | null>(
    null,
  );
  const st = STATUS[contrato.statusContrato] ?? {
    rotulo: contrato.statusContrato,
    classe: "bg-surface-muted text-ink-muted",
  };
  const assinado = contrato.statusContrato === "assinado";

  async function baixar() {
    setAcao("baixar");
    const r = await urlContratoAdminAction(contrato.locacaoId);
    setAcao(null);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
  }

  async function regenerar() {
    setAcao("regenerar");
    const r = await regenerarContratoAction(contrato.locacaoId);
    setAcao(null);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success("Contrato regenerado.");
    if (r.aviso) toast.warning(r.aviso);
    router.refresh();
  }

  async function reenviar() {
    setAcao("reenviar");
    const r = await reenviarContratoAction(contrato.locacaoId);
    setAcao(null);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success(r.aviso ?? "Contrato reenviado.");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/admin/locacoes/${contrato.locacaoId}`}
              className="text-sm font-medium text-ink hover:underline"
            >
              {rotuloLocacao(contrato.numero)}
            </Link>
            <p className="truncate text-sm text-ink-muted">
              {contrato.locatario}
            </p>
            <p className="text-xs text-ink-muted">
              {contrato.dataEvento}
              {contrato.enviadoEm ? ` · enviado ${contrato.enviadoEm}` : ""}
              {contrato.assinadoEm ? ` · assinado ${contrato.assinadoEm}` : ""}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
              st.classe,
            )}
          >
            {st.rotulo}
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={acao === "baixar"}
            disabled={!contrato.temPdf || acao !== null}
            onClick={baixar}
          >
            <Download className="size-4" />
            Baixar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={acao === "reenviar"}
            disabled={assinado || acao !== null}
            onClick={reenviar}
          >
            <Send className="size-4" />
            Reenviar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            loading={acao === "regenerar"}
            disabled={assinado || acao !== null}
            onClick={regenerar}
          >
            <RefreshCw className="size-4" />
            Regenerar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
