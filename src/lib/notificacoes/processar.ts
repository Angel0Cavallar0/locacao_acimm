import "server-only";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enviarEmailCanal } from "./canais/email";
import type { ResultadoEnvio } from "./canais/tipos";
import { enviarWhatsapp } from "./canais/whatsapp";
import { type PayloadNotificacao, templates } from "./templates";

/**
 * Consumo da fila `notificacoes` (Spec 15 §2). É a MESMA função usada pelo
 * disparo imediato (`after()`) e pelo cron de retry (Spec 16). A reserva atômica
 * (`reservar_notificacoes`, `for update skip locked`) garante que rodadas
 * concorrentes não processem a mesma linha.
 */

interface LinhaReservada {
  id: string;
  canal: "whatsapp" | "email";
  destinatario: string;
  template: string;
  payload: PayloadNotificacao;
  tentativas: number;
}

async function enviarLinha(linha: LinhaReservada): Promise<ResultadoEnvio> {
  const builders = templates[linha.template];
  if (!builders) {
    return { ok: false, erro: `Template desconhecido: ${linha.template}`, retryable: false };
  }
  const payload = (linha.payload ?? {}) as PayloadNotificacao;

  if (linha.canal === "whatsapp") {
    if (!builders.whatsapp) {
      return { ok: false, erro: "Template sem canal WhatsApp.", retryable: false };
    }
    let texto: string;
    try {
      texto = builders.whatsapp(payload);
    } catch {
      return { ok: false, erro: "Falha ao montar a mensagem.", retryable: false };
    }
    return enviarWhatsapp(linha.destinatario, texto);
  }

  if (!builders.email) {
    return { ok: false, erro: "Template sem canal e-mail.", retryable: false };
  }
  let email: { assunto: string; html: string };
  try {
    email = builders.email(payload);
  } catch {
    return { ok: false, erro: "Falha ao montar o e-mail.", retryable: false };
  }
  return enviarEmailCanal(linha.destinatario, email.assunto, email.html);
}

export interface ResumoProcessamento {
  processadas: number;
  enviadas: number;
  falhas: number;
}

export async function processarNotificacoes(
  limite = 20,
): Promise<ResumoProcessamento> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reservar_notificacoes", {
    p_limite: limite,
  });
  if (error || !data) return { processadas: 0, enviadas: 0, falhas: 0 };

  const linhas = data as LinhaReservada[];
  let enviadas = 0;
  let falhas = 0;

  for (const linha of linhas) {
    const res = await enviarLinha(linha);
    if (res.ok) {
      await admin
        .from("notificacoes")
        .update({
          status: "enviada",
          enviada_em: new Date().toISOString(),
          ultimo_erro: null,
        })
        .eq("id", linha.id);
      enviadas++;
      continue;
    }
    // Falha definitiva: erro não-retentável OU 5ª tentativa esgotada (§4).
    const definitiva = !res.retryable || linha.tentativas >= 5;
    await admin
      .from("notificacoes")
      .update({
        status: definitiva ? "falha" : "pendente",
        ultimo_erro: res.erro.slice(0, 500),
      })
      .eq("id", linha.id);
    if (definitiva) falhas++;
  }

  return { processadas: linhas.length, enviadas, falhas };
}

/**
 * Disparo imediato best-effort pós-resposta (§2.3). Não segura o usuário; se não
 * houver contexto de request (chamada fora de uma action/route), o cron cobre.
 */
export function agendarProcessamento(limite = 20): void {
  try {
    after(async () => {
      try {
        await processarNotificacoes(limite);
      } catch (e) {
        console.error("[notificacoes] processamento falhou:", e);
      }
    });
  } catch {
    // Sem contexto de request — o backlog é despachado pelo cron (Spec 16).
  }
}
