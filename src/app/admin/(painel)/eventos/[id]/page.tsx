import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireColaborador } from "@/lib/auth/guards";
import { dataSP, horaSP, utcParaNaiveSP } from "@/lib/calendario/tempo";
import { PRIORIDADE_ROTULO } from "@/lib/calendario/tipos";
import {
  carregarEvento,
  contarFilaEspera,
  salasParaRemanejo,
} from "@/lib/eventos/dados";
import { isSymplaConfigured } from "@/lib/integracoes/sympla";
import { createAdminClient } from "@/lib/supabase/admin";
import { EventoForm } from "../evento-form";
import { EventoAcoes } from "./evento-acoes";
import { RemanejarPanel } from "./remanejar-panel";
import { SymplaVinculo } from "./sympla-vinculo";

export const metadata: Metadata = { title: "Evento" };

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-ink">{titulo}</h3>
        {children}
      </CardContent>
    </Card>
  );
}

export default async function EventoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireColaborador();
  const { id } = await params;

  const evento = await carregarEvento(id);
  if (!evento) notFound();

  const admin = createAdminClient();
  const { data: salas } = await admin
    .from("salas")
    .select("id, nome")
    .eq("ativa", true)
    .is("excluida_em", null)
    .order("ordem", { ascending: true });

  const hoje = utcParaNaiveSP(new Date().toISOString()).slice(0, 10);
  const dataEvento = utcParaNaiveSP(evento.inicioUtc).slice(0, 10);
  const remanejavel = evento.prioridade !== "alta" && !evento.cancelado;

  const [candidatas, filaEspera] = remanejavel
    ? await Promise.all([
        salasParaRemanejo(evento),
        contarFilaEspera(evento.salaId, dataEvento),
      ])
    : [[], 0];

  const ocupacaoPct =
    evento.capacidade > 0 && evento.qtdInscritos != null
      ? Math.min(100, Math.round((evento.qtdInscritos / evento.capacidade) * 100))
      : null;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/admin/eventos" className="text-sm text-ink-muted hover:text-ink">
        ← Eventos
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-lg font-semibold text-ink">
            {evento.titulo}
          </h1>
          <Badge
            variant={evento.prioridade === "alta" ? "destructive" : "secondary"}
          >
            {PRIORIDADE_ROTULO[evento.prioridade]}
          </Badge>
          {evento.cancelado ? <Badge variant="outline">Cancelado</Badge> : null}
        </div>
        {!evento.cancelado ? (
          <EventoAcoes eventoId={evento.id} temSympla={Boolean(evento.symplaEventId)} />
        ) : null}
      </div>

      <p className="text-sm text-ink-muted">
        {evento.salaNome} · {dataSP(evento.inicioUtc)} · {horaSP(evento.inicioUtc)}
        –{horaSP(evento.fimUtc)}
      </p>

      {evento.cancelado ? (
        <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-ink-muted">
          Este evento foi cancelado — a agenda já está liberada.
        </p>
      ) : (
        <Secao titulo="Dados do evento">
          <EventoForm salas={salas ?? []} evento={evento} hoje={hoje} />
        </Secao>
      )}

      <Secao titulo="Sympla">
        <SymplaVinculo
          eventoId={evento.id}
          symplaEventId={evento.symplaEventId}
          symplaUrl={evento.symplaUrl}
          qtdInscritos={evento.qtdInscritos}
          sincronizadoEmUtc={evento.sincronizadoEmUtc}
          symplaConfigurado={isSymplaConfigured()}
        />
      </Secao>

      {!evento.cancelado ? (
        <Secao titulo="Ocupação e remanejamento">
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-muted">Inscritos / capacidade</span>
            <span className="font-medium text-ink">
              {evento.qtdInscritos ?? "—"} / {evento.capacidade}
            </span>
          </div>
          {ocupacaoPct != null ? (
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${ocupacaoPct}%` }}
              />
            </div>
          ) : null}

          {evento.prioridade === "alta" ? (
            <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-ink-muted">
              Evento de alta prioridade não é remanejado.
            </p>
          ) : (
            <div className="mt-1 border-t pt-3">
              <p className="mb-2 text-xs font-medium text-ink-muted">
                Remanejar sala
              </p>
              <RemanejarPanel
                eventoId={evento.id}
                salaAtualNome={evento.salaNome}
                salaAtualCapacidade={evento.capacidade}
                candidatas={candidatas}
                filaEspera={filaEspera}
              />
            </div>
          )}
        </Secao>
      ) : null}
    </div>
  );
}
