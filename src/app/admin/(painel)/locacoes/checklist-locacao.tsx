import { CheckCircle2, Circle, XCircle } from "lucide-react";
import {
  type EntradaChecklist,
  montarChecklist,
} from "@/lib/locacoes/checklist-core";

/**
 * Checklist do fluxo ideal (Spec 32 §3.3): concluída em azul, pendente em
 * vermelho, cancelada riscada. Complementa a linha do tempo (auditoria).
 */
export function ChecklistLocacao(props: EntradaChecklist) {
  const etapas = montarChecklist(props);
  return (
    <ul className="flex flex-col gap-1.5">
      {etapas.map((e) => (
        <li key={e.chave} className="flex items-center gap-2 text-sm">
          {e.estado === "concluida" ? (
            <CheckCircle2 className="size-4 shrink-0 text-blue-600 dark:text-blue-400" />
          ) : e.estado === "cancelada" ? (
            <XCircle className="size-4 shrink-0 text-ink-muted" />
          ) : (
            <Circle className="size-4 shrink-0 text-red-500" />
          )}
          <span
            className={
              e.estado === "pendente"
                ? "text-red-600 dark:text-red-400"
                : e.estado === "cancelada"
                  ? "text-ink-muted line-through"
                  : "text-ink"
            }
          >
            {e.rotulo}
          </span>
        </li>
      ))}
    </ul>
  );
}
