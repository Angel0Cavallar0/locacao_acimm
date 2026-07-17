import { dataSP, horaSP } from "@/lib/calendario/tempo";
import { STATUS_ROTULO } from "@/lib/locacoes/maquina-estados-core";
import type { EventoTimeline } from "@/lib/locacoes/tipos";

function descricaoReagendamento(dados: unknown): string | null {
  if (!dados || typeof dados !== "object") return null;
  const d = dados as { antes?: { inicio?: string }; depois?: { inicio?: string } };
  if (!d.antes?.inicio || !d.depois?.inicio) return null;
  return `${dataSP(d.antes.inicio)} → ${dataSP(d.depois.inicio)}`;
}

function tituloEvento(e: EventoTimeline): string {
  // Transição de status: de ≠ para.
  if (e.de && e.de !== e.para) return STATUS_ROTULO[e.para];
  // Mesmo status: é um registro operacional (reagendamento, adicional…).
  return e.observacao ?? STATUS_ROTULO[e.para];
}

export function LinhaDoTempo({ eventos }: { eventos: EventoTimeline[] }) {
  if (eventos.length === 0) {
    return <p className="text-sm text-ink-muted">Sem histórico ainda.</p>;
  }

  return (
    <ol className="flex flex-col gap-4">
      {eventos.map((e) => {
        const transicao = e.de && e.de !== e.para;
        const reag =
          e.observacao === "Reagendamento"
            ? descricaoReagendamento(e.dados)
            : null;
        return (
          <li key={e.id} className="relative pl-4">
            <span className="absolute left-0 top-1.5 size-2 rounded-full bg-brand" />
            <p className="text-sm font-medium text-ink">{tituloEvento(e)}</p>
            {transicao && e.observacao ? (
              <p className="text-xs text-ink-muted">{e.observacao}</p>
            ) : null}
            {reag ? <p className="text-xs text-ink-muted">{reag}</p> : null}
            <p className="mt-0.5 text-xs text-ink-muted">
              {e.autorNome ?? "Sistema"} · {dataSP(e.criadoEmUtc)}{" "}
              {horaSP(e.criadoEmUtc)}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
