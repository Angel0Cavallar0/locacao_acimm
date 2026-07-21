import "server-only";
import { revalidatePath } from "next/cache";
import { spWallParaUtc, utcParaNaiveSP } from "@/lib/calendario/tempo";
import { requireColaborador } from "@/lib/auth/guards";
import { obterAntecedenciaCoffee } from "@/lib/coffee/config";
import { parsearFaixas, valorPessoaDe } from "@/lib/coffee/faixas-core";
import { respeitaAntecedencia } from "@/lib/disponibilidade/janela";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CoffeeLocacaoInput } from "@/lib/validacoes/coffee";
import { totalCoffee } from "./calcular-core";
import { podeEditarAdicionais, type StatusLocacao } from "./maquina-estados-core";

/**
 * Edição de coffee break no detalhe da locação (Spec 08 §6). Mesma regra dos
 * adicionais: só até `aprovada`. Cada mudança grava o valor como SNAPSHOT em
 * `coffee_breaks.valor_centavos` (valor por pessoa do nível × pessoas +
 * adicionais), recalcula `valor_coffee`/`valor_total` da locação e registra na
 * auditoria com antes/depois.
 */

export type ResultadoCoffee = { ok: true; aviso?: string } | { erro: string };

type Admin = ReturnType<typeof createAdminClient>;

interface LocacaoBase {
  status: StatusLocacao;
  inicio: string;
  valor_salas_centavos: number;
  valor_adicionais_centavos: number;
  valor_descontos_centavos: number;
}

async function carregarBase(
  admin: Admin,
  locacaoId: string,
): Promise<LocacaoBase | null> {
  const { data } = await admin
    .from("locacoes")
    .select(
      "status, inicio, valor_salas_centavos, valor_adicionais_centavos, valor_descontos_centavos",
    )
    .eq("id", locacaoId)
    .maybeSingle();
  return (data as LocacaoBase) ?? null;
}

/** Recalcula valor_coffee (soma dos snapshots) e valor_total. */
async function recomputar(
  admin: Admin,
  locacaoId: string,
  base: LocacaoBase,
): Promise<void> {
  const { data: coffees } = await admin
    .from("coffee_breaks")
    .select("valor_centavos")
    .eq("locacao_id", locacaoId);

  const valorCoffee = (coffees ?? []).reduce(
    (s, c) => s + (c.valor_centavos as number),
    0,
  );
  const valorTotal =
    base.valor_salas_centavos +
    valorCoffee +
    base.valor_adicionais_centavos -
    base.valor_descontos_centavos;

  await admin
    .from("locacoes")
    .update({
      valor_coffee_centavos: valorCoffee,
      valor_total_centavos: valorTotal,
    })
    .eq("id", locacaoId);
}

async function registrar(
  admin: Admin,
  locacaoId: string,
  status: StatusLocacao,
  autorUserId: string,
  observacao: string,
  dados: Record<string, unknown>,
): Promise<void> {
  await admin.from("locacao_eventos").insert({
    locacao_id: locacaoId,
    de: status,
    para: status,
    autor_user_id: autorUserId,
    observacao,
    dados,
  });
}

export async function salvarCoffeeLocacao(
  input: CoffeeLocacaoInput,
): Promise<ResultadoCoffee> {
  const { user } = await requireColaborador();
  const admin = createAdminClient();

  const base = await carregarBase(admin, input.locacaoId);
  if (!base) return { erro: "Locação não encontrada." };
  if (!podeEditarAdicionais(base.status)) {
    return { erro: "O coffee só pode ser editado até a aprovação." };
  }

  const { data: nivel } = await admin
    .from("coffee_niveis")
    .select("nome, faixas_preco")
    .eq("id", input.nivelId)
    .maybeSingle();
  if (!nivel) return { erro: "Nível de coffee não encontrado." };

  const adicionais = input.adicionais.map((a) => ({
    descricao: a.descricao,
    valorCentavos: a.valorCentavos,
  }));
  const adicionaisCentavos = adicionais.reduce(
    (s, a) => s + a.valorCentavos,
    0,
  );
  const valorPessoa = valorPessoaDe(
    parsearFaixas(nivel.faixas_preco),
    input.qtdPessoas,
  );
  const valorSnapshot = totalCoffee(
    valorPessoa,
    input.qtdPessoas,
    adicionaisCentavos,
  );

  const dataEvento = utcParaNaiveSP(base.inicio).slice(0, 10);
  const horarioServir =
    input.horarioServir && input.horarioServir !== ""
      ? spWallParaUtc(dataEvento, input.horarioServir)
      : null;

  const registro = {
    nivel_id: input.nivelId,
    qtd_pessoas: input.qtdPessoas,
    horario_servir: horarioServir,
    adicionais,
    observacoes: input.observacoes ? input.observacoes : null,
    valor_centavos: valorSnapshot,
  };

  let antes = 0;
  if (input.coffeeId) {
    const { data: atual } = await admin
      .from("coffee_breaks")
      .select("valor_centavos, locacao_id")
      .eq("id", input.coffeeId)
      .maybeSingle();
    if (!atual || atual.locacao_id !== input.locacaoId) {
      return { erro: "Coffee não encontrado." };
    }
    antes = atual.valor_centavos as number;
    const { error } = await admin
      .from("coffee_breaks")
      .update(registro)
      .eq("id", input.coffeeId);
    if (error) return { erro: "Não foi possível salvar o coffee." };
  } else {
    const { error } = await admin
      .from("coffee_breaks")
      .insert({ locacao_id: input.locacaoId, ...registro });
    if (error) return { erro: "Não foi possível incluir o coffee." };
  }

  await recomputar(admin, input.locacaoId, base);
  await registrar(
    admin,
    input.locacaoId,
    base.status,
    user.id,
    input.coffeeId
      ? `Coffee alterado: ${nivel.nome}`
      : `Coffee adicionado: ${nivel.nome}`,
    { coffee: { antes, depois: valorSnapshot, nivel: nivel.nome } },
  );

  // Antecedência do coffee (§A): fluxo do painel — apenas avisa, não bloqueia.
  const { dias: coffeeDias } = await obterAntecedenciaCoffee();
  const aviso = respeitaAntecedencia(dataEvento, coffeeDias)
    ? undefined
    : `Atenção: pedidos de coffee break costumam exigir ${coffeeDias} dia(s) de antecedência. O coffee foi salvo assim mesmo.`;

  revalidatePath(`/admin/locacoes/${input.locacaoId}`);
  return { ok: true, aviso };
}

export async function removerCoffeeLocacao(
  coffeeId: string,
): Promise<ResultadoCoffee> {
  const { user } = await requireColaborador();
  const admin = createAdminClient();

  const { data: coffee } = await admin
    .from("coffee_breaks")
    .select("locacao_id, valor_centavos, coffee_niveis ( nome )")
    .eq("id", coffeeId)
    .maybeSingle();
  if (!coffee) return { erro: "Coffee não encontrado." };
  const locacaoId = coffee.locacao_id as string;

  const base = await carregarBase(admin, locacaoId);
  if (!base) return { erro: "Locação não encontrada." };
  if (!podeEditarAdicionais(base.status)) {
    return { erro: "O coffee só pode ser editado até a aprovação." };
  }

  const { error } = await admin
    .from("coffee_breaks")
    .delete()
    .eq("id", coffeeId);
  if (error) return { erro: "Não foi possível remover o coffee." };

  const n = coffee.coffee_niveis as { nome?: string } | { nome?: string }[] | null;
  const nivelNome = Array.isArray(n) ? (n[0]?.nome ?? "") : (n?.nome ?? "");

  await recomputar(admin, locacaoId, base);
  await registrar(
    admin,
    locacaoId,
    base.status,
    user.id,
    `Coffee removido${nivelNome ? `: ${nivelNome}` : ""}`,
    { coffee: { antes: coffee.valor_centavos, depois: 0 } },
  );

  revalidatePath(`/admin/locacoes/${locacaoId}`);
  return { ok: true };
}
