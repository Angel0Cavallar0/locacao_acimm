import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ModeloCobranca, ServicoAdicional } from "./tipos";

/** Leitura do catálogo de serviços adicionais (Spec 30 §2). Via service role. */

const SELECT =
  `id, nome, descricao, modelo_cobranca, unidade, valor_unitario_centavos,
   sala_id, requer_aprovacao, sujeito_disponibilidade, ativo, salas ( nome )`;

function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function mapear(r: Record<string, unknown>): ServicoAdicional {
  const sala = um(r.salas as unknown) as { nome?: string } | null;
  return {
    id: r.id as string,
    nome: r.nome as string,
    descricao: (r.descricao as string | null) ?? null,
    modeloCobranca: r.modelo_cobranca as ModeloCobranca,
    unidade: (r.unidade as string | null) ?? null,
    valorUnitarioCentavos: (r.valor_unitario_centavos as number | null) ?? null,
    salaId: (r.sala_id as string | null) ?? null,
    salaNome: sala?.nome ?? null,
    requerAprovacao: r.requer_aprovacao === true,
    sujeitoDisponibilidade: r.sujeito_disponibilidade === true,
    ativo: r.ativo === true,
  };
}

/** Todos os serviços não-excluídos (ativos e inativos) — gestão admin. */
export async function listarServicos(): Promise<ServicoAdicional[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("servicos_adicionais")
    .select(SELECT)
    .is("excluido_em", null)
    .order("nome", { ascending: true });
  return ((data ?? []) as Record<string, unknown>[]).map(mapear);
}

export async function obterServico(
  id: string,
): Promise<ServicoAdicional | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("servicos_adicionais")
    .select(SELECT)
    .eq("id", id)
    .is("excluido_em", null)
    .maybeSingle();
  return data ? mapear(data as Record<string, unknown>) : null;
}

/**
 * Serviços ativos disponíveis para uma locação: `sala_id` nulo (qualquer sala)
 * OU vinculado a uma das salas da locação. `incluirSobConsulta=false` no portal.
 */
export async function listarServicosDisponiveis(
  salaIds: string[],
  incluirSobConsulta: boolean,
): Promise<ServicoAdicional[]> {
  const admin = createAdminClient();
  let q = admin
    .from("servicos_adicionais")
    .select(SELECT)
    .is("excluido_em", null)
    .eq("ativo", true);

  if (salaIds.length > 0) {
    q = q.or(`sala_id.is.null,sala_id.in.(${salaIds.join(",")})`);
  } else {
    q = q.is("sala_id", null);
  }

  const { data } = await q.order("nome", { ascending: true });
  let itens = ((data ?? []) as Record<string, unknown>[]).map(mapear);
  if (!incluirSobConsulta) {
    itens = itens.filter((s) => s.modeloCobranca !== "sob_consulta");
  }
  return itens;
}
