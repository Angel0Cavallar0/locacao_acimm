import { CalendarPlus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireColaborador } from "@/lib/auth/guards";
import { dataSP, horaSP } from "@/lib/calendario/tempo";
import { PRIORIDADE_ROTULO } from "@/lib/calendario/tipos";
import { listarEventosInternos } from "@/lib/eventos/dados";
import type { PrioridadeEvento } from "@/lib/eventos/tipos";
import { createAdminClient } from "@/lib/supabase/admin";
import { EventosFiltros } from "./eventos-filtros";

export const metadata: Metadata = { title: "Eventos ACIMM" };

export default async function EventosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireColaborador();
  const sp = await searchParams;
  const str = (v: string | string[] | undefined) =>
    (Array.isArray(v) ? v[0] : v) ?? "";

  const salaId = str(sp.sala) || null;
  const prioridade = (str(sp.prioridade) || null) as PrioridadeEvento | null;
  const passados = str(sp.passados) === "1";
  const cancelados = str(sp.cancelados) === "1";

  const admin = createAdminClient();
  const [{ data: salasRows }, eventos] = await Promise.all([
    admin
      .from("salas")
      .select("id, nome")
      .is("excluida_em", null)
      .order("ordem", { ascending: true }),
    listarEventosInternos({
      salaId,
      prioridade,
      incluirPassados: passados,
      incluirCancelados: cancelados,
    }),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-display text-lg font-semibold text-ink">
          Eventos internos ACIMM
        </h1>
        <Link
          href="/admin/eventos/nova"
          className={buttonVariants({ variant: "default", size: "sm" })}
        >
          <CalendarPlus className="size-4" />
          Novo evento
        </Link>
      </div>

      <EventosFiltros
        salas={salasRows ?? []}
        params={{
          sala: salaId ?? "",
          prioridade: prioridade ?? "",
          passados: passados ? "1" : "",
          cancelados: cancelados ? "1" : "",
        }}
      />

      {eventos.length === 0 ? (
        <p className="text-sm text-ink-muted">Nenhum evento no filtro atual.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {eventos.map((e) => (
            <Link key={e.id} href={`/admin/eventos/${e.id}`} className="block">
              <Card
                className={`transition-colors hover:bg-surface-muted ${e.prioridade === "alta" ? "border-l-4 border-l-destructive" : ""} ${e.cancelado ? "opacity-60" : ""}`}
              >
                <CardContent className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-ink">{e.titulo}</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {e.cancelado ? (
                        <Badge variant="outline">Cancelado</Badge>
                      ) : null}
                      <Badge
                        variant={
                          e.prioridade === "alta" ? "destructive" : "secondary"
                        }
                      >
                        {PRIORIDADE_ROTULO[e.prioridade]}
                      </Badge>
                      {e.symplaEventId ? (
                        <Badge variant="outline">
                          <Users className="mr-1 size-3" />
                          {e.qtdInscritos ?? "?"}/{e.capacidade} Sympla
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                  <p className="text-sm text-ink-muted">
                    {e.salaNome} · {dataSP(e.inicioUtc)} · {horaSP(e.inicioUtc)}–
                    {horaSP(e.fimUtc)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
