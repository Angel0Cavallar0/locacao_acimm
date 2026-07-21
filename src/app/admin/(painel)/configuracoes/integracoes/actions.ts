"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import {
  atualizarCalendario,
  desconectar,
} from "@/lib/google/conexao";
import { assinarState } from "@/lib/google/state";
import { gerarUrlAutorizacao, isGoogleConfigured } from "@/lib/integracoes/google";

/**
 * Ações da integração Google Calendar (Spec 18 §3). Admin only. Nenhuma chama o
 * Google no caminho crítico de locação — são operações de configuração.
 */

/** Gera a URL de consentimento (state assinado, CSRF) para o admin conectar. */
export async function conectarGoogleAction(): Promise<{
  url?: string;
  error?: string;
}> {
  const { user } = await requireAdmin();
  if (!isGoogleConfigured()) {
    return { error: "Integração indisponível — credenciais não configuradas." };
  }
  const state = assinarState(user.id);
  return { url: gerarUrlAutorizacao(state) };
}

/** Define o calendário alvo dos espelhos. */
export async function escolherCalendarioAction(
  calendarioId: string,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin();
  const id = calendarioId.trim();
  if (!id) return { error: "Selecione um calendário." };
  try {
    await atualizarCalendario(id);
  } catch {
    return { error: "Não foi possível salvar o calendário." };
  }
  revalidatePath("/admin/configuracoes/integracoes");
  return { ok: true };
}

/** Desconecta a conta (revoga no Google + limpa o registro). */
export async function desconectarGoogleAction(): Promise<{
  ok?: true;
  error?: string;
}> {
  await requireAdmin();
  try {
    await desconectar();
  } catch {
    return { error: "Não foi possível desconectar." };
  }
  revalidatePath("/admin/configuracoes/integracoes");
  return { ok: true };
}
