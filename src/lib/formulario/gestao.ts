import "server-only";
import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  alternarAtivoSchema,
  criarCampoSchema,
  editarCampoSchema,
  reordenarCampoSchema,
} from "@/lib/validacoes/campos-formulario";
import { exigeOpcoes, normalizarOpcoes, type TipoCampo } from "./campos-core";

/**
 * CRUD dos campos do formulário (Spec 22 §2). Colaborador (operação do dia a
 * dia). Sem hard delete — desativa. Limite de sanidade de 15 campos ATIVOS
 * imposto AQUI (servidor, §2). Tipo é imutável: o editar nem recebe o tipo.
 */

export type ResultadoCampo = { ok: true } | { erro: string };

const CAMINHO = "/admin/configuracoes/formulario";
const LIMITE_ATIVOS = 15;

function revalidar() {
  revalidatePath(CAMINHO);
  // Os formulários (portal/assistido) leem os campos ativos a cada request.
  revalidatePath("/locacoes/nova");
  revalidatePath("/admin/locacoes/nova");
}

async function ativosCount(
  admin: ReturnType<typeof createAdminClient>,
): Promise<number> {
  const { count } = await admin
    .from("campos_formulario")
    .select("id", { count: "exact", head: true })
    .eq("ativo", true);
  return count ?? 0;
}

/** ≥ 2 opções para seleção/multiseleção (§2). */
function opcoesValidas(tipo: TipoCampo, opcoes: string[]): string | null {
  if (exigeOpcoes(tipo) && opcoes.length < 2) {
    return "Seleção e multiseleção exigem ao menos 2 opções.";
  }
  return null;
}

export async function criarCampo(input: unknown): Promise<ResultadoCampo> {
  await requireColaborador();
  const parsed = criarCampoSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { rotulo, tipo, obrigatorio, ativo } = parsed.data;
  const opcoes = normalizarOpcoes(parsed.data.opcoes);

  const erroOpcoes = opcoesValidas(tipo, opcoes);
  if (erroOpcoes) return { erro: erroOpcoes };

  const admin = createAdminClient();

  if (ativo && (await ativosCount(admin)) >= LIMITE_ATIVOS) {
    return {
      erro: `Limite de ${LIMITE_ATIVOS} campos ativos atingido. Desative um campo antes de adicionar outro.`,
    };
  }

  const { data: ult } = await admin
    .from("campos_formulario")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordem = ((ult?.ordem as number | undefined) ?? -1) + 1;

  const { error } = await admin.from("campos_formulario").insert({
    rotulo,
    tipo,
    opcoes,
    obrigatorio,
    ativo,
    ordem,
  });
  if (error) return { erro: "Não foi possível criar o campo." };

  revalidar();
  return { ok: true };
}

export async function editarCampo(input: unknown): Promise<ResultadoCampo> {
  await requireColaborador();
  const parsed = editarCampoSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { id, rotulo, obrigatorio, ativo } = parsed.data;
  const opcoes = normalizarOpcoes(parsed.data.opcoes);

  const admin = createAdminClient();
  const { data: atual } = await admin
    .from("campos_formulario")
    .select("tipo, ativo")
    .eq("id", id)
    .maybeSingle();
  if (!atual) return { erro: "Campo não encontrado." };

  const erroOpcoes = opcoesValidas(atual.tipo as TipoCampo, opcoes);
  if (erroOpcoes) return { erro: erroOpcoes };

  // Reativar respeita o limite de ativos.
  if (ativo && !atual.ativo && (await ativosCount(admin)) >= LIMITE_ATIVOS) {
    return {
      erro: `Limite de ${LIMITE_ATIVOS} campos ativos atingido. Desative outro antes de reativar este.`,
    };
  }

  const { error } = await admin
    .from("campos_formulario")
    .update({ rotulo, opcoes, obrigatorio, ativo })
    .eq("id", id);
  if (error) return { erro: "Não foi possível salvar o campo." };

  revalidar();
  return { ok: true };
}

export async function alternarAtivoCampo(
  input: unknown,
): Promise<ResultadoCampo> {
  await requireColaborador();
  const parsed = alternarAtivoSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const admin = createAdminClient();

  if (parsed.data.ativo && (await ativosCount(admin)) >= LIMITE_ATIVOS) {
    return {
      erro: `Limite de ${LIMITE_ATIVOS} campos ativos atingido.`,
    };
  }

  const { error } = await admin
    .from("campos_formulario")
    .update({ ativo: parsed.data.ativo })
    .eq("id", parsed.data.id);
  if (error) return { erro: "Não foi possível alterar o campo." };

  revalidar();
  return { ok: true };
}

/**
 * Move um campo uma posição para cima/baixo e reescreve `ordem` sequencial
 * (0..n-1) — robusto a lacunas/duplicatas no valor de `ordem`.
 */
export async function reordenarCampo(input: unknown): Promise<ResultadoCampo> {
  await requireColaborador();
  const parsed = reordenarCampoSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const { id, direcao } = parsed.data;

  const admin = createAdminClient();
  const { data } = await admin
    .from("campos_formulario")
    .select("id")
    .order("ordem", { ascending: true })
    .order("criado_em", { ascending: true });
  const lista = ((data ?? []) as { id: string }[]).map((r) => r.id);

  const idx = lista.indexOf(id);
  if (idx < 0) return { erro: "Campo não encontrado." };
  const alvo = direcao === "cima" ? idx - 1 : idx + 1;
  if (alvo < 0 || alvo >= lista.length) return { ok: true }; // já na borda

  [lista[idx], lista[alvo]] = [lista[alvo], lista[idx]];

  // Reescreve a ordem só das linhas cuja posição mudou (as duas trocadas).
  const menor = Math.min(idx, alvo);
  const maior = Math.max(idx, alvo);
  for (let i = menor; i <= maior; i++) {
    await admin
      .from("campos_formulario")
      .update({ ordem: i })
      .eq("id", lista[i]);
  }

  revalidar();
  return { ok: true };
}
