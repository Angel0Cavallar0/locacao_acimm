"use server";

import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { salaSchema } from "@/lib/validacoes/salas";

export interface EstadoSala {
  error?: string;
  success?: string;
}

export interface ResultadoCriarSala {
  error?: string;
  id?: string;
}

const STATUS_FUTUROS_CONFIRMADOS = [
  "aprovada",
  "contrato_enviado",
  "contrato_assinado",
  "aguardando_pagamento",
  "confirmada",
];

function lerEquipamentos(v: FormDataEntryValue | null): string[] {
  if (!v) return [];
  try {
    const arr = JSON.parse(String(v));
    return Array.isArray(arr) ? arr.map(String) : [];
  } catch {
    return String(v)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

async function nomeDuplicado(
  nome: string,
  ignorarId?: string,
): Promise<boolean> {
  const admin = createAdminClient();
  let q = admin
    .from("salas")
    .select("id")
    .eq("ativa", true)
    .ilike("nome", nome);
  if (ignorarId) q = q.neq("id", ignorarId);
  const { data } = await q.limit(1);
  return (data?.length ?? 0) > 0;
}

export async function criarSala(
  _prev: ResultadoCriarSala,
  formData: FormData,
): Promise<ResultadoCriarSala> {
  await requireColaborador();

  const parsed = salaSchema.safeParse({
    nome: formData.get("nome"),
    descricao: formData.get("descricao") ?? "",
    capacidade: formData.get("capacidade"),
    equipamentos: lerEquipamentos(formData.get("equipamentos")),
    ativa: formData.get("ativa") === "on" || formData.get("ativa") === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (parsed.data.ativa && (await nomeDuplicado(parsed.data.nome))) {
    return { error: "Já existe uma sala ativa com esse nome." };
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("salas")
    .insert({
      nome: parsed.data.nome,
      descricao: parsed.data.descricao || null,
      capacidade: parsed.data.capacidade,
      equipamentos: parsed.data.equipamentos,
      ativa: parsed.data.ativa,
    })
    .select("id")
    .single();

  if (error || !data) return { error: "Não foi possível criar a sala." };

  // Retorna o id para o client enviar as fotos pendentes e navegar.
  revalidatePath("/admin/salas");
  return { id: data.id as string };
}

export async function atualizarSala(
  _prev: EstadoSala,
  formData: FormData,
): Promise<EstadoSala> {
  await requireColaborador();

  const id = String(formData.get("id") ?? "");
  if (!id) return { error: "Sala inválida." };

  const parsed = salaSchema.safeParse({
    nome: formData.get("nome"),
    descricao: formData.get("descricao") ?? "",
    capacidade: formData.get("capacidade"),
    equipamentos: lerEquipamentos(formData.get("equipamentos")),
    ativa: formData.get("ativa") === "on" || formData.get("ativa") === "true",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  if (parsed.data.ativa && (await nomeDuplicado(parsed.data.nome, id))) {
    return { error: "Já existe uma sala ativa com esse nome." };
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("salas")
    .update({
      nome: parsed.data.nome,
      descricao: parsed.data.descricao || null,
      capacidade: parsed.data.capacidade,
      equipamentos: parsed.data.equipamentos,
      ativa: parsed.data.ativa,
    })
    .eq("id", id);

  if (error) return { error: "Não foi possível salvar a sala." };

  revalidatePath("/admin/salas");
  revalidatePath(`/admin/salas/${id}`);
  return { success: "Sala salva." };
}

export interface ResultadoSala {
  error?: string;
}

export async function alternarAtivaSala(
  id: string,
  ativa: boolean,
): Promise<ResultadoSala> {
  await requireColaborador();

  // Ao reativar, respeitar a unicidade de nome entre ativas.
  if (ativa) {
    const admin = createAdminClient();
    const { data: sala } = await admin
      .from("salas")
      .select("nome")
      .eq("id", id)
      .maybeSingle();
    if (sala && (await nomeDuplicado(sala.nome, id))) {
      return { error: "Já existe outra sala ativa com esse nome." };
    }
  }

  const admin = createAdminClient();
  const { error } = await admin.from("salas").update({ ativa }).eq("id", id);
  if (error) return { error: "Não foi possível atualizar o status." };

  revalidatePath("/admin/salas");
  return {};
}

export async function moverSala(
  id: string,
  direcao: "cima" | "baixo",
): Promise<ResultadoSala> {
  await requireColaborador();
  const admin = createAdminClient();

  const { data: salas } = await admin
    .from("salas")
    .select("id, ordem")
    .order("ordem", { ascending: true })
    .order("criado_em", { ascending: true });
  if (!salas) return { error: "Não foi possível reordenar." };

  const idx = salas.findIndex((s) => s.id === id);
  const alvo = direcao === "cima" ? idx - 1 : idx + 1;
  if (idx < 0 || alvo < 0 || alvo >= salas.length) return {};

  const lista = [...salas];
  [lista[idx], lista[alvo]] = [lista[alvo], lista[idx]];

  // Renumera sequencialmente (robusto contra `ordem` repetida/default 0).
  await Promise.all(
    lista.map((s, i) => admin.from("salas").update({ ordem: i }).eq("id", s.id)),
  );

  revalidatePath("/admin/salas");
  return {};
}

export interface LocacaoFutura {
  numero: number;
  locatario: string;
  inicio: string;
}

/** Locações futuras confirmadas que usam a sala — para o aviso de desativação. */
export async function locacoesFuturasDaSala(
  salaId: string,
): Promise<LocacaoFutura[]> {
  await requireColaborador();
  const admin = createAdminClient();

  const agora = new Date().toISOString();
  const { data } = await admin
    .from("locacao_salas")
    .select(
      "locacoes!inner(numero, locatario_nome, inicio, status)",
    )
    .eq("sala_id", salaId)
    .in("locacoes.status", STATUS_FUTUROS_CONFIRMADOS)
    .gte("locacoes.inicio", agora);

  type Linha = {
    locacoes: {
      numero: number;
      locatario_nome: string;
      inicio: string;
    } | null;
  };

  return ((data ?? []) as unknown as Linha[])
    .map((l) => l.locacoes)
    .filter((l): l is NonNullable<Linha["locacoes"]> => l !== null)
    .map((l) => ({
      numero: l.numero,
      locatario: l.locatario_nome,
      inicio: l.inicio,
    }));
}
