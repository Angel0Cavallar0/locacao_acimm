import "server-only";
import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type ServicoAdicionalInput,
  servicoAdicionalSchema,
} from "@/lib/validacoes/servicos-adicionais";

/** Gestão (CRUD) do catálogo de serviços adicionais (Spec 30 §2.3). */

const CAMINHO = "/admin/configuracoes/servicos";

export type ResultadoServico = { ok: true; id?: string } | { erro: string };

function paraColunas(v: ServicoAdicionalInput) {
  return {
    nome: v.nome,
    descricao: v.descricao,
    modelo_cobranca: v.modeloCobranca,
    unidade: v.unidade,
    valor_unitario_centavos: v.valorUnitarioCentavos,
    sala_id: v.salaId,
    requer_aprovacao: v.requerAprovacao,
    sujeito_disponibilidade: v.sujeitoDisponibilidade,
    ativo: v.ativo,
  };
}

export async function criarServico(input: unknown): Promise<ResultadoServico> {
  await requireColaborador();
  const parsed = servicoAdicionalSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("servicos_adicionais")
    .insert(paraColunas(parsed.data))
    .select("id")
    .single();
  if (error) return { erro: "Não foi possível criar o serviço." };

  revalidatePath(CAMINHO);
  return { ok: true, id: (data as { id: string }).id };
}

export async function editarServico(
  id: string,
  input: unknown,
): Promise<ResultadoServico> {
  await requireColaborador();
  const parsed = servicoAdicionalSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("servicos_adicionais")
    .update(paraColunas(parsed.data))
    .eq("id", id)
    .is("excluido_em", null);
  if (error) return { erro: "Não foi possível salvar o serviço." };

  revalidatePath(CAMINHO);
  return { ok: true };
}

export async function alternarAtivoServico(
  id: string,
  ativo: boolean,
): Promise<ResultadoServico> {
  await requireColaborador();
  const admin = createAdminClient();
  const { error } = await admin
    .from("servicos_adicionais")
    .update({ ativo })
    .eq("id", id)
    .is("excluido_em", null);
  if (error) return { erro: "Não foi possível atualizar." };
  revalidatePath(CAMINHO);
  return { ok: true };
}

/** Soft-delete: some do catálogo, preserva o histórico das locações. */
export async function excluirServico(id: string): Promise<ResultadoServico> {
  await requireColaborador();
  const admin = createAdminClient();
  const { error } = await admin
    .from("servicos_adicionais")
    .update({ excluido_em: new Date().toISOString(), ativo: false })
    .eq("id", id);
  if (error) return { erro: "Não foi possível excluir." };
  revalidatePath(CAMINHO);
  return { ok: true };
}
