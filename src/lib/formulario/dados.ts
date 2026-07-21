import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CampoDef, TipoCampo } from "./campos-core";

/** Leitura dos campos do formulário (Spec 22). */

export interface CampoGestao extends CampoDef {
  ativo: boolean;
  ordem: number;
  /** Nº de locações que já responderam este campo (chave presente no jsonb). */
  totalRespostas: number;
  criadoEmUtc: string;
}

interface CampoRow {
  id: string;
  rotulo: string;
  tipo: TipoCampo;
  opcoes: string[] | null;
  obrigatorio: boolean;
  ativo: boolean;
  ordem: number;
  criado_em: string;
}

/** Todos os campos (ativos e inativos), ordenados, com a contagem de respostas. */
export async function listarCamposGestao(): Promise<CampoGestao[]> {
  const admin = createAdminClient();
  const [{ data: campos }, { data: contagens }] = await Promise.all([
    admin
      .from("campos_formulario")
      .select("id, rotulo, tipo, opcoes, obrigatorio, ativo, ordem, criado_em")
      .order("ordem", { ascending: true })
      .order("criado_em", { ascending: true }),
    admin.rpc("contar_respostas_campos"),
  ]);

  const total = new Map<string, number>();
  for (const c of (contagens ?? []) as { campo_id: string; total: number }[]) {
    total.set(c.campo_id, Number(c.total));
  }

  return ((campos ?? []) as CampoRow[]).map((c) => ({
    id: c.id,
    rotulo: c.rotulo,
    tipo: c.tipo,
    opcoes: c.opcoes ?? [],
    obrigatorio: c.obrigatorio,
    ativo: c.ativo,
    ordem: c.ordem,
    totalRespostas: total.get(c.id) ?? 0,
    criadoEmUtc: c.criado_em,
  }));
}

/** Campos ATIVOS (para o formulário e o preview) — fonte única. */
export async function camposAtivos(): Promise<CampoDef[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("campos_formulario")
    .select("id, rotulo, tipo, opcoes, obrigatorio")
    .eq("ativo", true)
    .order("ordem", { ascending: true });

  return ((data ?? []) as Omit<CampoRow, "ativo" | "ordem" | "criado_em">[]).map(
    (c) => ({
      id: c.id,
      rotulo: c.rotulo,
      tipo: c.tipo,
      opcoes: c.opcoes ?? [],
      obrigatorio: c.obrigatorio,
    }),
  );
}

/** TODOS os campos (ativos e inativos) como CampoDef — para resolver rótulos na
 * exibição dos detalhes (§3: exibição pelo rótulo ATUAL, mesmo desativado). */
export async function todosCamposDef(): Promise<CampoDef[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("campos_formulario")
    .select("id, rotulo, tipo, opcoes, obrigatorio")
    .order("ordem", { ascending: true });
  return ((data ?? []) as Omit<CampoRow, "ativo" | "ordem" | "criado_em">[]).map(
    (c) => ({
      id: c.id,
      rotulo: c.rotulo,
      tipo: c.tipo,
      opcoes: c.opcoes ?? [],
      obrigatorio: c.obrigatorio,
    }),
  );
}

/** Opções realmente usadas por um campo (aviso ao remover — §3). */
export async function opcoesEmUso(campoId: string): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin.rpc("opcoes_em_uso", { p_campo_id: campoId });
  return ((data ?? []) as { opcao: string }[]).map((r) => r.opcao);
}
