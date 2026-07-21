import "server-only";
import {
  contarParticipantes,
  isSymplaConfigured,
  SymplaError,
} from "@/lib/integracoes/sympla";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Sync horário de inscritos do Sympla (Spec 17 §6). Eventos futuros, não
 * cancelados, com vínculo → `contarParticipantes` sequencial (delay curto) →
 * atualiza `qtd_inscritos` + `sincronizado_em`. Lote máx. 30; idempotente. Falha
 * individual não derruba o lote; 401 interrompe e sinaliza configuração.
 */

const LOTE = 30;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface ResultadoSympla {
  processados: number;
  erros: number;
  motivo?: string;
}

export async function processarSymplaInscritos(): Promise<ResultadoSympla> {
  if (!isSymplaConfigured()) {
    console.info("[sympla-inscritos] SYMPLA_API_TOKEN ausente — no-op.");
    return { processados: 0, erros: 0, motivo: "Sympla não configurado." };
  }

  const admin = createAdminClient();
  const { data } = await admin
    .from("eventos_internos")
    .select("id, sympla_event_id")
    .eq("cancelado", false)
    .not("sympla_event_id", "is", null)
    .gte("fim", new Date().toISOString())
    .order("inicio", { ascending: true })
    .limit(LOTE);

  const eventos = (data ?? []) as Array<{ id: string; sympla_event_id: string }>;
  let processados = 0;
  let erros = 0;

  for (const ev of eventos) {
    try {
      const qtd = await contarParticipantes(ev.sympla_event_id);
      await admin
        .from("eventos_internos")
        .update({ qtd_inscritos: qtd, sincronizado_em: new Date().toISOString() })
        .eq("id", ev.id);
      processados++;
      await delay(300); // cortesia de rate
    } catch (e) {
      erros++;
      if (e instanceof SymplaError && e.tipo === "config") {
        // 401/403: token inválido — não adianta seguir. Alerta de configuração.
        return {
          processados,
          erros,
          motivo: "Token do Sympla inválido — verifique a configuração.",
        };
      }
      // 429/5xx/temporário: segue; o próximo ciclo reprocessa (backoff natural).
    }
  }

  return { processados, erros };
}
