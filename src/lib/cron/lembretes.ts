import "server-only";
import { spWallParaUtc } from "@/lib/calendario/tempo";
import { adicionarDiasISO, hojeSP } from "@/lib/coffee/periodo";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Lembrete pré-evento (Spec 16 §4.2). Seleciona locações `confirmada` com evento
 * AMANHÃ (data em Sao_Paulo) e enfileira `lembrete_pre_evento` via fila do Spec
 * 15. A dedupe (uma linha por locação/template) fica em `notificarLembrete` —
 * reexecutar no mesmo dia não duplica.
 */
export async function processarLembretes(): Promise<{
  processados: number;
  enviados: number;
}> {
  const admin = createAdminClient();

  const amanha = adicionarDiasISO(hojeSP(), 1);
  const depois = adicionarDiasISO(amanha, 1);
  const inicio = spWallParaUtc(amanha, "00:00");
  const fim = spWallParaUtc(depois, "00:00");

  const { data } = await admin
    .from("locacoes")
    .select("id")
    .eq("status", "confirmada")
    .gte("inicio", inicio)
    .lt("inicio", fim);

  const alvos = (data ?? []).map((r) => r.id as string);
  if (alvos.length === 0) return { processados: 0, enviados: 0 };

  const { notificarLembrete } = await import("@/lib/notificacoes/eventos");
  let enviados = 0;
  for (const id of alvos) {
    if (await notificarLembrete(id)) enviados++;
  }
  return { processados: alvos.length, enviados };
}
