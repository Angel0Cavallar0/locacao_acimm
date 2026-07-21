"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { processarCoffeePdf } from "@/lib/cron/coffee-pdf";
import { processarLembretes } from "@/lib/cron/lembretes";
import { processarSymplaInscritos } from "@/lib/cron/sympla-inscritos";
import { processarReconciliacaoGoogle } from "@/lib/google/reconciliacao";
import { processarNotificacoes } from "@/lib/notificacoes/processar";

/**
 * "Executar agora" (Spec 16 §5): roda a mesma lógica do job direto, com
 * `requireAdmin` como autoridade (sem depender do secret/HTTP). Suporte sem SQL.
 */
export async function executarJobAction(
  job: string,
): Promise<{ resumo?: string; error?: string }> {
  await requireAdmin();

  try {
    if (job === "notificacoes-retry") {
      const r = await processarNotificacoes(50);
      return {
        resumo: `${r.enviadas} enviada(s), ${r.falhas} falha(s) de ${r.processadas} processada(s).`,
      };
    }
    if (job === "lembretes") {
      const r = await processarLembretes();
      return {
        resumo: `${r.enviados} lembrete(s) enfileirado(s) de ${r.processados} confirmada(s) para amanhã.`,
      };
    }
    if (job === "coffee-pdf") {
      const r = await processarCoffeePdf();
      if (!r.gerado) return { resumo: r.motivo ?? "Nada a processar." };
      return { resumo: r.enviado ? "PDF gerado e envio enfileirado." : `PDF gerado. ${r.motivo ?? ""}` };
    }
    if (job === "sympla-inscritos") {
      const r = await processarSymplaInscritos();
      return {
        resumo:
          r.motivo ?? `${r.processados} evento(s) sincronizado(s), ${r.erros} erro(s).`,
      };
    }
    if (job === "google-reconciliacao") {
      const r = await processarReconciliacaoGoogle();
      return {
        resumo:
          r.motivo ?? `${r.processados} item(ns) espelhado(s), ${r.erros} erro(s).`,
      };
    }
    return { error: "Rotina desconhecida." };
  } catch {
    return { error: "Falha ao executar a rotina." };
  } finally {
    revalidatePath("/admin/configuracoes");
  }
}
