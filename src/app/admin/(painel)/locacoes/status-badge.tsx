import {
  grupoStatus,
  STATUS_ROTULO,
  type StatusLocacao,
} from "@/lib/locacoes/maquina-estados-core";
import { cn } from "@/lib/utils";

const CLASSE_GRUPO: Record<string, string> = {
  rascunho: "bg-surface-muted text-ink-muted",
  pendente: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  andamento: "bg-blue-500/15 text-blue-700 dark:text-blue-400",
  concluida: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  encerrada: "bg-destructive/10 text-destructive",
};

/** Badge de status com cor por grupo (pendente/andamento/concluída/encerrada). */
export function StatusBadge({
  status,
  className,
}: {
  status: StatusLocacao;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit items-center rounded-full px-2 text-xs font-medium whitespace-nowrap",
        CLASSE_GRUPO[grupoStatus(status)],
        className,
      )}
    >
      {STATUS_ROTULO[status]}
    </span>
  );
}

/** Etiqueta complementar: sinaliza pagamento ainda pendente fora do status "Aguardando pagamento". */
export function PagamentoPendenteBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit items-center rounded-full bg-amber-500/15 px-2 text-xs font-medium whitespace-nowrap text-amber-700 dark:text-amber-400",
        className,
      )}
    >
      Pagamento pendente
    </span>
  );
}
