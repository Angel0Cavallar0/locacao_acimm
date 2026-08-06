"use server";

import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  adicionarAdicional,
  editarAdicional,
  removerAdicional,
} from "@/lib/locacoes/adicionais";
import {
  removerCoffeeLocacao,
  salvarCoffeeLocacao,
} from "@/lib/locacoes/coffee";
import { transicionarLocacao } from "@/lib/locacoes/maquina-estados";
import type { StatusLocacao } from "@/lib/locacoes/maquina-estados-core";
import { reagendarLocacao } from "@/lib/locacoes/reagendamento";
import type { PeriodoDia } from "@/lib/dominio";
import { coffeeLocacaoSchema } from "@/lib/validacoes/coffee";
import {
  adicionalSchema,
  reagendarSchema,
  transicaoSchema,
} from "@/lib/validacoes/locacoes";

export interface ResultadoAcao {
  error?: string;
  /** Aviso não-bloqueante (ex.: antecedência do coffee — §A). */
  aviso?: string;
}

export async function transicionar(input: {
  locacaoId: string;
  para: StatusLocacao;
  motivo?: string;
  observacao?: string;
}): Promise<ResultadoAcao> {
  const parsed = transicaoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const r = await transicionarLocacao(parsed.data);
  return "ok" in r ? {} : { error: r.erro };
}

export async function reagendar(input: {
  locacaoId: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  periodo: PeriodoDia;
  salaIds: string[];
  sobreposicaoAutorizada?: boolean;
}): Promise<ResultadoAcao & { aviso?: string; conflitoSobreposicao?: string }> {
  const parsed = reagendarSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const r = await reagendarLocacao(parsed.data);
  if ("ok" in r) return { aviso: r.aviso };
  if ("conflitoSobreposicao" in r) {
    return { conflitoSobreposicao: r.conflitoSobreposicao };
  }
  return { error: r.erro };
}

/**
 * Observações internas da equipe (Spec 32 §3.4). Texto livre visível SÓ no
 * admin — nunca chega ao portal (LocacaoPortalDetalhe não carrega o campo).
 */
export async function salvarObservacoesInternasAction(input: {
  locacaoId: string;
  texto: string;
}): Promise<ResultadoAcao> {
  await requireColaborador();
  const texto = input.texto.trim();
  if (texto.length > 5000) {
    return { error: "Texto muito longo (máx. 5000 caracteres)." };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from("locacoes")
    .update({ observacoes_internas: texto.length > 0 ? texto : null })
    .eq("id", input.locacaoId);
  if (error) return { error: "Não foi possível salvar as observações." };
  revalidatePath(`/admin/locacoes/${input.locacaoId}`);
  return {};
}

export async function adicionarAdicionalAction(input: {
  locacaoId: string;
  descricao: string;
  quantidade: number;
  valorUnitarioCentavos: number;
  servicoAdicionalId?: string | null;
}): Promise<ResultadoAcao> {
  const parsed = adicionalSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const r = await adicionarAdicional({ locacaoId: input.locacaoId, ...parsed.data });
  return "ok" in r ? {} : { error: r.erro };
}

export async function editarAdicionalAction(input: {
  adicionalId: string;
  descricao: string;
  quantidade: number;
  valorUnitarioCentavos: number;
}): Promise<ResultadoAcao> {
  const parsed = adicionalSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const r = await editarAdicional({
    adicionalId: input.adicionalId,
    ...parsed.data,
  });
  return "ok" in r ? {} : { error: r.erro };
}

export async function removerAdicionalAction(
  adicionalId: string,
): Promise<ResultadoAcao> {
  const r = await removerAdicional(adicionalId);
  return "ok" in r ? {} : { error: r.erro };
}

export async function salvarCoffeeAction(input: {
  locacaoId: string;
  coffeeId?: string;
  nivelId: string;
  qtdPessoas: number;
  horarioServir?: string;
  adicionais: { descricao: string; valorCentavos: number }[];
  observacoes?: string;
}): Promise<ResultadoAcao> {
  const parsed = coffeeLocacaoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const r = await salvarCoffeeLocacao(parsed.data);
  return "ok" in r ? { aviso: r.aviso } : { error: r.erro };
}

export async function removerCoffeeAction(
  coffeeId: string,
): Promise<ResultadoAcao> {
  const r = await removerCoffeeLocacao(coffeeId);
  return "ok" in r ? {} : { error: r.erro };
}
