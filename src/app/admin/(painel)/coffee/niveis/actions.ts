"use server";

import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { nivelCoffeeSchema } from "@/lib/validacoes/coffee";

export interface ResultadoNivel {
  error?: string;
  id?: string;
}

type Admin = ReturnType<typeof createAdminClient>;

/** Itens gravados em snake_case no JSONB — quantidade FIXA por pedido. */
function composicaoParaBanco(
  itens: { item: string; qtd: number; unidade: string }[],
) {
  return itens.map((c) => ({
    item: c.item,
    qtd: c.qtd,
    unidade: c.unidade,
  }));
}

/** Faixas gravadas em snake_case no JSONB. */
function faixasParaBanco(
  faixas: {
    minPessoas: number;
    maxPessoas: number | null;
    valorPessoaCentavos: number;
  }[],
) {
  return [...faixas]
    .sort((a, b) => a.minPessoas - b.minPessoas)
    .map((f) => ({
      min_pessoas: f.minPessoas,
      max_pessoas: f.maxPessoas,
      valor_pessoa_centavos: f.valorPessoaCentavos,
    }));
}

async function nomeDuplicado(
  admin: Admin,
  nome: string,
  ignorarId?: string,
): Promise<boolean> {
  let q = admin
    .from("coffee_niveis")
    .select("id")
    .eq("ativo", true)
    .ilike("nome", nome);
  if (ignorarId) q = q.neq("id", ignorarId);
  const { data } = await q.limit(1);
  return (data?.length ?? 0) > 0;
}

export async function criarNivel(input: unknown): Promise<ResultadoNivel> {
  await requireColaborador();
  const parsed = nivelCoffeeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const admin = createAdminClient();

  if (parsed.data.ativo && (await nomeDuplicado(admin, parsed.data.nome))) {
    return { error: "Já existe um nível ativo com esse nome." };
  }

  const { data: maxRow } = await admin
    .from("coffee_niveis")
    .select("ordem")
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordem = ((maxRow?.ordem as number | undefined) ?? -1) + 1;

  const { data, error } = await admin
    .from("coffee_niveis")
    .insert({
      nome: parsed.data.nome,
      descricao: parsed.data.descricao || null,
      faixas_preco: faixasParaBanco(parsed.data.faixasPreco),
      composicao: composicaoParaBanco(parsed.data.composicao),
      ativo: parsed.data.ativo,
      ordem,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Não foi possível criar o nível." };

  revalidatePath("/admin/coffee/niveis");
  return { id: data.id as string };
}

export async function atualizarNivel(
  id: string,
  input: unknown,
): Promise<ResultadoNivel> {
  await requireColaborador();
  if (!id) return { error: "Nível inválido." };
  const parsed = nivelCoffeeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const admin = createAdminClient();

  if (parsed.data.ativo && (await nomeDuplicado(admin, parsed.data.nome, id))) {
    return { error: "Já existe outro nível ativo com esse nome." };
  }

  // Nota: alterar o valor NÃO recalcula locações existentes — o coffee guarda o
  // valor em `coffee_breaks.valor_centavos` (snapshot). Só locações novas ou
  // recalculadas (reagendamento) usam o valor novo.
  const { error } = await admin
    .from("coffee_niveis")
    .update({
      nome: parsed.data.nome,
      descricao: parsed.data.descricao || null,
      faixas_preco: faixasParaBanco(parsed.data.faixasPreco),
      composicao: composicaoParaBanco(parsed.data.composicao),
      ativo: parsed.data.ativo,
      atualizado_em: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: "Não foi possível salvar o nível." };

  revalidatePath("/admin/coffee/niveis");
  return { id };
}

export async function alternarAtivoNivel(
  id: string,
  ativo: boolean,
): Promise<ResultadoNivel> {
  await requireColaborador();
  const admin = createAdminClient();

  if (ativo) {
    const { data: nivel } = await admin
      .from("coffee_niveis")
      .select("nome")
      .eq("id", id)
      .maybeSingle();
    if (nivel && (await nomeDuplicado(admin, nivel.nome, id))) {
      return { error: "Já existe outro nível ativo com esse nome." };
    }
  }

  const { error } = await admin
    .from("coffee_niveis")
    .update({ ativo, atualizado_em: new Date().toISOString() })
    .eq("id", id);
  if (error) return { error: "Não foi possível atualizar o status." };

  revalidatePath("/admin/coffee/niveis");
  return { id };
}

export async function moverNivel(
  id: string,
  direcao: "cima" | "baixo",
): Promise<ResultadoNivel> {
  await requireColaborador();
  const admin = createAdminClient();

  const { data: niveis } = await admin
    .from("coffee_niveis")
    .select("id, ordem")
    .order("ordem", { ascending: true })
    .order("criado_em", { ascending: true });
  if (!niveis) return { error: "Não foi possível reordenar." };

  const idx = niveis.findIndex((n) => n.id === id);
  const alvo = direcao === "cima" ? idx - 1 : idx + 1;
  if (idx < 0 || alvo < 0 || alvo >= niveis.length) return {};

  const lista = [...niveis];
  [lista[idx], lista[alvo]] = [lista[alvo], lista[idx]];

  await Promise.all(
    lista.map((n, i) =>
      admin.from("coffee_niveis").update({ ordem: i }).eq("id", n.id),
    ),
  );

  revalidatePath("/admin/coffee/niveis");
  return {};
}
