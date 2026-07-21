"use server";

import { requireAssociado } from "@/lib/auth/guards";
import { listarDisponibilidade } from "@/lib/disponibilidade/dados";
import { dentroDaJanela } from "@/lib/disponibilidade/janela";
import type { DisponibilidadeDia } from "@/lib/disponibilidade/tipos";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  filaEsperaSchema,
  filtrosDisponibilidadeSchema,
} from "@/lib/validacoes/disponibilidade";

type Admin = ReturnType<typeof createAdminClient>;

export async function listarDisponibilidadeAction(input: {
  data: string;
  salaIds?: string[];
  capacidadeMin?: number;
}): Promise<DisponibilidadeDia | { error: string }> {
  const { associado } = await requireAssociado();
  const parsed = filtrosDisponibilidadeSchema.safeParse(input);
  if (!parsed.success) return { error: "Filtros inválidos." };
  if (!dentroDaJanela(parsed.data.data)) {
    return { error: "Data fora do período disponível." };
  }

  return listarDisponibilidade({
    data: parsed.data.data,
    salaIds: parsed.data.salaIds.length > 0 ? parsed.data.salaIds : null,
    capacidadeMin: parsed.data.capacidadeMin || null,
    situacao: associado.situacao,
  });
}

async function contarNaFrente(
  admin: Admin,
  salaId: string,
  data: string,
  criadoEm: string,
): Promise<number> {
  const { count } = await admin
    .from("lista_espera")
    .select("id", { count: "exact", head: true })
    .eq("sala_id", salaId)
    .eq("data", data)
    .is("convertido_locacao_id", null)
    .is("arquivado_em", null)
    .lt("criado_em", criadoEm);
  return count ?? 0;
}

export interface StatusFila {
  jaNaFila: boolean;
  pessoasNaFrente: number;
}

export async function statusFilaEspera(
  salaId: string,
  data: string,
): Promise<StatusFila> {
  const { associado } = await requireAssociado();
  const admin = createAdminClient();
  const { data: existente } = await admin
    .from("lista_espera")
    .select("criado_em")
    .eq("associado_id", associado.id)
    .eq("sala_id", salaId)
    .eq("data", data)
    .is("convertido_locacao_id", null)
    .is("arquivado_em", null)
    .order("criado_em", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!existente) return { jaNaFila: false, pessoasNaFrente: 0 };
  return {
    jaNaFila: true,
    pessoasNaFrente: await contarNaFrente(
      admin,
      salaId,
      data,
      existente.criado_em as string,
    ),
  };
}

export interface ResultadoFila extends StatusFila {
  error?: string;
  ok?: boolean;
}

export async function entrarFilaEspera(input: {
  salaId: string;
  data: string;
  nome: string;
  contato: string;
}): Promise<ResultadoFila> {
  const { associado } = await requireAssociado();
  if (associado.situacao !== "ativo") {
    return {
      error: "Sua situação junto à ACIMM não permite entrar na fila.",
      jaNaFila: false,
      pessoasNaFrente: 0,
    };
  }
  const parsed = filaEsperaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Dados inválidos.",
      jaNaFila: false,
      pessoasNaFrente: 0,
    };
  }
  if (!dentroDaJanela(parsed.data.data)) {
    return {
      error: "Data fora do período disponível.",
      jaNaFila: false,
      pessoasNaFrente: 0,
    };
  }

  const admin = createAdminClient();

  // Duplicata: mesmo associado + sala + data ainda não atendida.
  const { data: existente } = await admin
    .from("lista_espera")
    .select("criado_em")
    .eq("associado_id", associado.id)
    .eq("sala_id", parsed.data.salaId)
    .eq("data", parsed.data.data)
    .is("convertido_locacao_id", null)
    .is("arquivado_em", null)
    .order("criado_em", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existente) {
    return {
      ok: true,
      jaNaFila: true,
      pessoasNaFrente: await contarNaFrente(
        admin,
        parsed.data.salaId,
        parsed.data.data,
        existente.criado_em as string,
      ),
    };
  }

  const { data: inserido, error } = await admin
    .from("lista_espera")
    .insert({
      sala_id: parsed.data.salaId,
      data: parsed.data.data,
      associado_id: associado.id,
      nome: parsed.data.nome,
      contato: parsed.data.contato,
    })
    .select("criado_em")
    .single();
  if (error || !inserido) {
    return {
      error: "Não foi possível entrar na fila. Tente novamente.",
      jaNaFila: false,
      pessoasNaFrente: 0,
    };
  }

  return {
    ok: true,
    jaNaFila: false,
    pessoasNaFrente: await contarNaFrente(
      admin,
      parsed.data.salaId,
      parsed.data.data,
      inserido.criado_em as string,
    ),
  };
}
