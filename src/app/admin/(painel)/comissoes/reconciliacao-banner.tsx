"use client";

import { AlertTriangle, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { repararComissoesAction } from "./actions";

/**
 * Reconciliação (§4.3): as comissões são geradas por efeito best-effort. Este
 * aviso lista as pendências (confirmadas com recebimento sem comissão) e as
 * locações com isenção parcial a revisar, com um reparo idempotente.
 */
export function ReconciliacaoBanner({
  pendentes,
  revisaoParcial,
}: {
  pendentes: number;
  revisaoParcial: number;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  if (pendentes === 0 && revisaoParcial === 0) return null;

  function reparar() {
    iniciar(async () => {
      const r = await repararComissoesAction();
      if ("erro" in r) {
        toast.error(r.erro);
        return;
      }
      toast.success(
        r.geradas > 0
          ? `${r.geradas} locação(ões) reprocessada(s).`
          : "Nada a reparar.",
      );
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="flex flex-col gap-0.5">
          {pendentes > 0 ? (
            <span>
              <strong>{pendentes}</strong> locação(ões) confirmada(s) com
              recebimento mas <strong>sem comissão gerada</strong>.
            </span>
          ) : null}
          {revisaoParcial > 0 ? (
            <span>
              <strong>{revisaoParcial}</strong> locação(ões) com isenção parcial —
              confira a base da comissão manualmente.
            </span>
          ) : null}
        </div>
      </div>
      {pendentes > 0 ? (
        <Button
          variant="outline"
          size="sm"
          loading={pendente}
          onClick={reparar}
          className="self-start sm:self-auto"
        >
          <Wrench className="size-4" />
          Reparar
        </Button>
      ) : null}
    </div>
  );
}
