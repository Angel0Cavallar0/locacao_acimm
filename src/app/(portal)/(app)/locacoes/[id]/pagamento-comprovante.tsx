"use client";

import { FileCheck2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FORMA_PAGAMENTO_ROTULO } from "@/lib/locacoes/tipos";
import type { PagamentoPortal } from "@/lib/locacoes/portal-tipos";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { removerComprovante, urlComprovante } from "./actions";
import { TIPOS_COMPROVANTE, subirComprovante } from "./comprovante-upload";

const STATUS_ROTULO: Record<string, string> = {
  pendente: "Pendente",
  pago: "Pago",
  isento: "Isento",
  estornado: "Estornado",
};

export function PagamentoComprovante({
  pagamento,
}: {
  pagamento: PagamentoPortal;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const pendente = pagamento.status === "pendente";

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setEnviando(true);
    const r = await subirComprovante(pagamento.id, file);
    setEnviando(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    toast.success("Comprovante enviado.");
    router.refresh();
  }

  async function abrir() {
    setAbrindo(true);
    const r = await urlComprovante(pagamento.id);
    setAbrindo(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    window.open(r.url, "_blank", "noopener,noreferrer");
  }

  async function remover() {
    setEnviando(true);
    const r = await removerComprovante({ pagamentoId: pagamento.id });
    setEnviando(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success("Comprovante removido.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">{pagamento.descricao}</p>
          <p className="text-xs text-ink-muted">
            {FORMA_PAGAMENTO_ROTULO[pagamento.forma]} ·{" "}
            {centavosParaBRL(pagamento.valorCentavos)}
          </p>
        </div>
        <span
          className={
            pagamento.status === "pago"
              ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
              : "rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-muted"
          }
        >
          {STATUS_ROTULO[pagamento.status] ?? pagamento.status}
        </span>
      </div>

      {pagamento.temComprovante ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
            <FileCheck2 className="size-3.5" />
            Comprovante enviado
          </span>
          <Button
            variant="outline"
            size="sm"
            loading={abrindo}
            onClick={abrir}
          >
            Ver comprovante
          </Button>
          {pendente ? (
            <>
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
                onClick={remover}
                disabled={enviando}
              >
                Remover
              </Button>
            </>
          ) : null}
        </div>
      ) : pendente ? (
        <Button
          variant="outline"
          size="sm"
          loading={enviando}
          onClick={() => inputRef.current?.click()}
          className="self-start"
        >
          <Upload className="size-4" />
          Enviar comprovante
        </Button>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={TIPOS_COMPROVANTE.join(",")}
        className="hidden"
        onChange={aoEscolher}
      />
    </div>
  );
}
