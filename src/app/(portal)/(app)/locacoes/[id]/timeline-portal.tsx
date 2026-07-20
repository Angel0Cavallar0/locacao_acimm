import { dataSP, horaSP } from "@/lib/calendario/tempo";
import type { AutorTipo, EventoPortal } from "@/lib/locacoes/portal-tipos";

/**
 * Linha do tempo SANITIZADA do portal (Spec 12 §3.1): só rótulos em linguagem
 * de cliente, autor genérico e o motivo de recusa/cancelamento — nunca a
 * `observacao` interna nem nome de colaborador (garantido no loader/DTO).
 */

const AUTOR_ROTULO: Record<AutorTipo, string> = {
  voce: "Você",
  acimm: "ACIMM",
  sistema: "Sistema",
};

export function TimelinePortal({ eventos }: { eventos: EventoPortal[] }) {
  if (eventos.length === 0) return null;

  return (
    <ol className="flex flex-col gap-3">
      {eventos.map((e) => (
        <li key={e.id} className="flex gap-3">
          <div className="mt-1 flex flex-col items-center">
            <span className="size-2 rounded-full bg-brand" />
            <span className="w-px flex-1 bg-input" />
          </div>
          <div className="flex-1 pb-1">
            <p className="text-sm font-medium text-ink">{e.rotulo}</p>
            <p className="text-xs text-ink-muted">
              {dataSP(e.criadoEmUtc)} · {horaSP(e.criadoEmUtc)} ·{" "}
              {AUTOR_ROTULO[e.autorTipo]}
            </p>
            {e.motivo ? (
              <p className="mt-1 rounded-md bg-surface-muted px-2.5 py-1.5 text-xs text-ink">
                Motivo: {e.motivo}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
