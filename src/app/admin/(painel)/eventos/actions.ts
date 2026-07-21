"use server";

import { requireColaborador } from "@/lib/auth/guards";
import {
  cancelarEvento,
  criarEvento,
  desvincularSympla,
  editarEvento,
  moverEventoSala,
  vincularSympla,
} from "@/lib/eventos/gestao";
import {
  listarEventos as listarSympla,
  SymplaError,
} from "@/lib/integracoes/sympla";
import {
  criarEventoSchema,
  editarEventoSchema,
  moverSalaSchema,
  vincularSymplaSchema,
} from "@/lib/validacoes/eventos";

export interface ResultadoEventoAction {
  id?: string;
  conflitos?: string[];
  aviso?: string;
  error?: string;
}

export async function criarEventoAction(
  input: unknown,
): Promise<ResultadoEventoAction> {
  const parsed = criarEventoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const r = await criarEvento(parsed.data);
  return "erro" in r
    ? { error: r.erro }
    : { id: r.id, conflitos: r.conflitos, aviso: r.aviso };
}

export async function editarEventoAction(
  input: unknown,
): Promise<{ error?: string }> {
  const parsed = editarEventoSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const r = await editarEvento(parsed.data);
  return "erro" in r ? { error: r.erro } : {};
}

export async function cancelarEventoAction(
  eventoId: string,
): Promise<{ error?: string }> {
  const r = await cancelarEvento(eventoId);
  return "erro" in r ? { error: r.erro } : {};
}

export async function moverSalaAction(
  input: unknown,
): Promise<{ error?: string }> {
  const parsed = moverSalaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const r = await moverEventoSala(parsed.data);
  return "erro" in r ? { error: r.erro } : {};
}

export async function vincularSymplaAction(
  input: unknown,
): Promise<{ aviso?: string; error?: string }> {
  const parsed = vincularSymplaSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const r = await vincularSympla(parsed.data);
  return "erro" in r ? { error: r.erro } : { aviso: r.aviso };
}

export async function desvincularSymplaAction(
  eventoId: string,
): Promise<{ error?: string }> {
  const r = await desvincularSympla(eventoId);
  return "erro" in r ? { error: r.erro } : {};
}

export interface SymplaOpcao {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  url: string | null;
}

/** Eventos publicados na conta Sympla para o dropdown de vínculo (§5). Sem
 * busca por nome — lista os publicados na janela (−30 dias → +1 ano). */
export async function listarEventosSymplaAction(): Promise<{
  eventos?: SymplaOpcao[];
  error?: string;
}> {
  await requireColaborador();
  const agora = Date.now();
  const de = new Date(agora - 30 * 86_400_000).toISOString().slice(0, 10);
  const ate = new Date(agora + 365 * 86_400_000).toISOString().slice(0, 10);

  try {
    const eventos = await listarSympla({ de, ate });
    return {
      eventos: eventos.slice(0, 100).map((e) => ({
        id: e.id,
        name: e.name,
        startDate: e.startDate,
        endDate: e.endDate,
        url: e.url,
      })),
    };
  } catch (e) {
    return {
      error:
        e instanceof SymplaError && e.tipo === "config"
          ? "Token do Sympla inválido — verifique a configuração."
          : "Não foi possível carregar eventos do Sympla no momento.",
    };
  }
}
