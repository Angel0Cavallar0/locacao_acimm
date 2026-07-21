import "server-only";
import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import type { PeriodoDia } from "@/lib/dominio";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  criarRegraGratuitoSchema,
  editarRegraGratuitoSchema,
} from "@/lib/validacoes/periodo-gratuito";

/**
 * Regras de período gratuito por sala (Spec 20 §5.1). Gestão do colaborador
 * (não só admin). Escrita via service role; sem hard delete (ativo/inativo).
 */

export type ResultadoRegra = { ok: true } | { erro: string };

export interface RegraGratuitoLinha {
  id: string;
  salaId: string;
  salaNome: string;
  periodos: PeriodoDia[];
  usosPorCiclo: number;
  ativo: boolean;
  atualizadoEmUtc: string;
  atualizadoPorNome: string | null;
}

const CAMINHO = "/admin/configuracoes/periodo-gratuito";

interface RegraRow {
  id: string;
  sala_id: string;
  periodos: PeriodoDia[];
  usos_por_ciclo: number;
  ativo: boolean;
  atualizado_em: string;
  atualizado_por: string | null;
  salas: { nome: string } | { nome: string }[] | null;
}

function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export async function listarRegras(): Promise<RegraGratuitoLinha[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("regras_periodo_gratuito")
    .select(
      "id, sala_id, periodos, usos_por_ciclo, ativo, atualizado_em, atualizado_por, salas ( nome )",
    )
    .order("criado_em", { ascending: true });

  const rows = (data ?? []) as RegraRow[];

  const autores = [
    ...new Set(rows.map((r) => r.atualizado_por ?? "").filter(Boolean)),
  ];
  const nomes = new Map<string, string>();
  if (autores.length > 0) {
    const { data: cols } = await admin
      .from("colaboradores")
      .select("user_id, nome")
      .in("user_id", autores);
    for (const c of (cols ?? []) as { user_id: string; nome: string }[]) {
      nomes.set(c.user_id, c.nome);
    }
  }

  return rows.map((r) => ({
    id: r.id,
    salaId: r.sala_id,
    salaNome: um(r.salas)?.nome ?? "—",
    periodos: r.periodos ?? [],
    usosPorCiclo: r.usos_por_ciclo,
    ativo: r.ativo,
    atualizadoEmUtc: r.atualizado_em,
    atualizadoPorNome: r.atualizado_por
      ? (nomes.get(r.atualizado_por) ?? null)
      : null,
  }));
}

/** Salas ativas que ainda não têm regra (uma regra por sala). */
export async function salasSemRegra(): Promise<
  { id: string; nome: string }[]
> {
  const admin = createAdminClient();
  const [{ data: salas }, { data: regras }] = await Promise.all([
    admin
      .from("salas")
      .select("id, nome")
      .eq("ativa", true)
      .is("excluida_em", null)
      .order("ordem", { ascending: true }),
    admin.from("regras_periodo_gratuito").select("sala_id"),
  ]);
  const comRegra = new Set(
    ((regras ?? []) as { sala_id: string }[]).map((r) => r.sala_id),
  );
  return ((salas ?? []) as { id: string; nome: string }[]).filter(
    (s) => !comRegra.has(s.id),
  );
}

export async function criarRegra(input: unknown): Promise<ResultadoRegra> {
  const { user } = await requireColaborador();
  const parsed = criarRegraGratuitoSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const admin = createAdminClient();
  const { error } = await admin.from("regras_periodo_gratuito").insert({
    sala_id: parsed.data.salaId,
    periodos: parsed.data.periodos,
    usos_por_ciclo: parsed.data.usosPorCiclo,
    atualizado_por: user.id,
  });
  if (error) {
    if (error.code === "23505") {
      return { erro: "Esta sala já tem uma regra. Edite a existente." };
    }
    return { erro: "Não foi possível criar a regra." };
  }
  revalidatePath(CAMINHO);
  return { ok: true };
}

export async function editarRegra(input: unknown): Promise<ResultadoRegra> {
  const { user } = await requireColaborador();
  const parsed = editarRegraGratuitoSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("regras_periodo_gratuito")
    .update({
      periodos: parsed.data.periodos,
      usos_por_ciclo: parsed.data.usosPorCiclo,
      ativo: parsed.data.ativo,
      atualizado_por: user.id,
    })
    .eq("id", parsed.data.id);
  if (error) return { erro: "Não foi possível salvar a regra." };
  revalidatePath(CAMINHO);
  return { ok: true };
}
