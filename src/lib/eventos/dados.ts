import "server-only";
import type { PrioridadeEvento } from "@/lib/calendario/tipos";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventoDetalhe, EventoLista, SalaRemanejo } from "./tipos";

/** Camada de leitura dos eventos internos (Spec 17). Service role. */

function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export interface FiltrosEventos {
  salaId: string | null;
  prioridade: PrioridadeEvento | null;
  incluirPassados: boolean;
  incluirCancelados: boolean;
}

function mapaEvento(r: Record<string, unknown>): EventoLista {
  const sala = um(
    r.salas as { nome?: string; capacidade?: number } | { nome?: string; capacidade?: number }[] | null,
  );
  return {
    id: r.id as string,
    titulo: r.titulo as string,
    salaId: r.sala_id as string,
    salaNome: sala?.nome ?? "Sala",
    inicioUtc: r.inicio as string,
    fimUtc: r.fim as string,
    prioridade: r.prioridade as PrioridadeEvento,
    cancelado: r.cancelado as boolean,
    symplaEventId: (r.sympla_event_id as string) ?? null,
    symplaUrl: (r.sympla_url as string) ?? null,
    qtdInscritos: (r.qtd_inscritos as number) ?? null,
    capacidade: sala?.capacidade ?? 0,
  };
}

export async function listarEventosInternos(
  f: FiltrosEventos,
): Promise<EventoLista[]> {
  const admin = createAdminClient();
  let q = admin
    .from("eventos_internos")
    .select(
      "id, titulo, sala_id, inicio, fim, prioridade, cancelado, sympla_event_id, sympla_url, qtd_inscritos, salas ( nome, capacidade )",
    );

  if (!f.incluirCancelados) q = q.eq("cancelado", false);
  if (f.salaId) q = q.eq("sala_id", f.salaId);
  if (f.prioridade) q = q.eq("prioridade", f.prioridade);
  if (!f.incluirPassados) q = q.gte("fim", new Date().toISOString());

  q = q.order("inicio", { ascending: true });

  const { data } = await q;
  return ((data ?? []) as Record<string, unknown>[]).map(mapaEvento);
}

export async function carregarEvento(id: string): Promise<EventoDetalhe | null> {
  const admin = createAdminClient();
  const { data: r } = await admin
    .from("eventos_internos")
    .select(
      "id, titulo, descricao, sala_id, inicio, fim, prioridade, cancelado, sympla_event_id, sympla_url, qtd_inscritos, sincronizado_em, criado_em, atualizado_em, salas ( nome, capacidade )",
    )
    .eq("id", id)
    .maybeSingle();
  if (!r) return null;

  const base = mapaEvento(r as Record<string, unknown>);
  return {
    ...base,
    descricao: (r.descricao as string) ?? null,
    sincronizadoEmUtc: (r.sincronizado_em as string) ?? null,
    criadoEmUtc: r.criado_em as string,
    atualizadoEmUtc: r.atualizado_em as string,
  };
}

interface AgendaItem {
  sala_id: string;
  bloqueante: boolean;
}

/**
 * Salas ativas LIVRES no horário do evento com capacidade ≥ inscritos (§7).
 * Ordena da mais justa para a maior. Exclui a sala atual do evento. "Livre" =
 * sem ocupação bloqueante no intervalo. A ocupação do próprio evento fica na
 * sala atual (já excluída), então não interfere nas candidatas.
 */
export async function salasParaRemanejo(
  evento: EventoDetalhe,
): Promise<SalaRemanejo[]> {
  const admin = createAdminClient();
  const minCapacidade = evento.qtdInscritos ?? 0;

  const [{ data: salas }, { data: agenda }] = await Promise.all([
    admin
      .from("salas")
      .select("id, nome, capacidade")
      .eq("ativa", true)
      .is("excluida_em", null)
      .gte("capacidade", minCapacidade)
      .order("capacidade", { ascending: true }),
    admin.rpc("agenda_no_intervalo", {
      p_inicio: evento.inicioUtc,
      p_fim: evento.fimUtc,
    }),
  ]);

  const ocupadas = new Set(
    ((agenda ?? []) as AgendaItem[])
      .filter((i) => i.bloqueante)
      .map((i) => i.sala_id),
  );

  return ((salas ?? []) as Array<{ id: string; nome: string; capacidade: number }>)
    .filter((s) => s.id !== evento.salaId && !ocupadas.has(s.id))
    .map((s) => ({ id: s.id, nome: s.nome, capacidade: s.capacidade }));
}

/** Interessados ainda não convertidos na sala/data (aviso do remanejamento §7). */
export async function contarFilaEspera(
  salaId: string,
  dataISO: string,
): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("lista_espera")
    .select("id", { count: "exact", head: true })
    .eq("sala_id", salaId)
    .eq("data", dataISO)
    .is("convertido_locacao_id", null);
  return count ?? 0;
}
