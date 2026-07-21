import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Marca uma locação/evento como pendente de espelho no Google (Spec 18 §4). Os
 * hooks e actions SÓ marcam — nenhuma chamada ao Google no caminho do usuário.
 * Depois disparam a reconciliação best-effort via `after()` (import dinâmico do
 * processador, para não puxar o cliente Google para o grafo da transição). Sem
 * contexto de request, o cron de 15 min cobre.
 *
 * Best-effort por design: falha ao marcar apenas loga (nunca quebra o fluxo).
 */

async function marcar(tabela: "locacoes" | "eventos_internos", id: string) {
  try {
    const admin = createAdminClient();
    await admin.from(tabela).update({ google_sync_pendente: true }).eq("id", id);
  } catch (e) {
    console.error(`[google] falha ao marcar ${tabela}/${id}:`, e);
  }
}

function agendarReconciliacao(): void {
  try {
    after(async () => {
      try {
        const { processarReconciliacaoGoogle } = await import("./reconciliacao");
        await processarReconciliacaoGoogle();
      } catch (e) {
        console.error("[google] reconciliação falhou:", e);
      }
    });
  } catch {
    // Sem contexto de request — o cron `google-reconciliacao` despacha depois.
  }
}

export async function marcarLocacaoPendente(locacaoId: string): Promise<void> {
  await marcar("locacoes", locacaoId);
  agendarReconciliacao();
}

export async function marcarEventoPendente(eventoId: string): Promise<void> {
  await marcar("eventos_internos", eventoId);
  agendarReconciliacao();
}

/** Marca vários eventos (ocorrências de uma recorrência) e dispara UMA vez. */
export async function marcarEventosPendentes(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  try {
    const admin = createAdminClient();
    await admin
      .from("eventos_internos")
      .update({ google_sync_pendente: true })
      .in("id", ids);
  } catch (e) {
    console.error("[google] falha ao marcar eventos em lote:", e);
  }
  agendarReconciliacao();
}
