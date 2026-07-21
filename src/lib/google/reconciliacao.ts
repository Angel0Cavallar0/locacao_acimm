import "server-only";
import {
  atualizarEvento,
  criarEvento,
  GoogleError,
  isGoogleConfigured,
  removerEvento,
  type SendUpdates,
} from "@/lib/integracoes/google";
import { createAdminClient } from "@/lib/supabase/admin";
import { obterConexaoAtiva } from "./conexao";
import {
  montarPayloadEventoInterno,
  montarPayloadLocacao,
} from "./eventos-payload";

/**
 * Processador da fila de reconciliação (Spec 18 §4). Reserva pendências (claim
 * atômico via RPC), decide create/patch/delete pelo ESTADO ATUAL de cada item e
 * espelha no Google. Falha → re-marca a flag (próximo ciclo tenta). Nunca é
 * chamado no caminho síncrono do usuário — só via `after()` e cron.
 */

type Conexao = { accessToken: string; calendarId: string };

interface Pendencia {
  tipo: "locacao" | "evento";
  ref_id: string;
  event_id: string | null;
}

export interface ResultadoReconciliacao {
  processados: number;
  erros: number;
  motivo?: string;
}

async function remarcar(tipo: Pendencia["tipo"], id: string): Promise<void> {
  const admin = createAdminClient();
  const tabela = tipo === "locacao" ? "locacoes" : "eventos_internos";
  await admin
    .from(tabela)
    .update({ google_sync_pendente: true })
    .eq("id", id);
}

async function salvarEventId(
  tipo: Pendencia["tipo"],
  id: string,
  eventId: string | null,
): Promise<void> {
  const admin = createAdminClient();
  const tabela = tipo === "locacao" ? "locacoes" : "eventos_internos";
  await admin.from(tabela).update({ google_event_id: eventId }).eq("id", id);
}

/** Cria (ou recria) o evento e persiste o novo id. */
async function criarEPersistir(
  conn: Conexao,
  p: Pendencia,
  corpo: Parameters<typeof criarEvento>[2],
  sendUpdates: SendUpdates,
): Promise<void> {
  const eventId = await criarEvento(conn.accessToken, conn.calendarId, corpo, sendUpdates);
  await salvarEventId(p.tipo, p.ref_id, eventId);
}

async function reconciliarLocacao(conn: Conexao, p: Pendencia): Promise<void> {
  const payload = await montarPayloadLocacao(p.ref_id);
  if (!payload) return; // locação sumiu — nada a espelhar

  const sendUpdates: SendUpdates = payload.comConvidado ? "all" : "none";

  if (payload.existir) {
    if (!p.event_id) {
      await criarEPersistir(conn, p, payload.evento, sendUpdates);
      return;
    }
    try {
      await atualizarEvento(
        conn.accessToken,
        conn.calendarId,
        p.event_id,
        payload.evento,
        sendUpdates,
      );
    } catch (e) {
      // Evento apagado à mão no Calendar → recria (§4).
      if (e instanceof GoogleError && e.tipo === "nao_encontrado") {
        await criarEPersistir(conn, p, payload.evento, sendUpdates);
        return;
      }
      throw e;
    }
    return;
  }

  // Não deve existir (recusada/cancelada): remove e limpa o id.
  if (p.event_id) {
    await removerEvento(conn.accessToken, conn.calendarId, p.event_id, "all");
    await salvarEventId(p.tipo, p.ref_id, null);
  }
}

async function reconciliarEvento(conn: Conexao, p: Pendencia): Promise<void> {
  const payload = await montarPayloadEventoInterno(p.ref_id);
  if (!payload) return;

  if (payload.existir) {
    if (!p.event_id) {
      await criarEPersistir(conn, p, payload.evento, "none");
      return;
    }
    try {
      await atualizarEvento(
        conn.accessToken,
        conn.calendarId,
        p.event_id,
        payload.evento,
        "none",
      );
    } catch (e) {
      if (e instanceof GoogleError && e.tipo === "nao_encontrado") {
        await criarEPersistir(conn, p, payload.evento, "none");
        return;
      }
      throw e;
    }
    return;
  }

  // Cancelado: remove o espelho.
  if (p.event_id) {
    await removerEvento(conn.accessToken, conn.calendarId, p.event_id, "none");
    await salvarEventId(p.tipo, p.ref_id, null);
  }
}

export async function processarReconciliacaoGoogle(
  limite = 30,
): Promise<ResultadoReconciliacao> {
  if (!isGoogleConfigured()) {
    return { processados: 0, erros: 0, motivo: "Google não configurado." };
  }

  const conn = await obterConexaoAtiva();
  if (!conn) {
    // Sem conexão ativa/expirada → não reserva; as flags acumulam (§4).
    return {
      processados: 0,
      erros: 0,
      motivo: "Sem conexão Google ativa — pendências acumulando.",
    };
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc("reservar_google_pendencias", {
    p_limite: limite,
  });
  if (error || !data) return { processados: 0, erros: 0 };

  const pendencias = (data as Array<{ tipo: string; ref_id: string; event_id: string | null }>).map(
    (r) => ({
      tipo: r.tipo === "evento" ? ("evento" as const) : ("locacao" as const),
      ref_id: r.ref_id,
      event_id: r.event_id,
    }),
  );

  let processados = 0;
  let erros = 0;

  for (let i = 0; i < pendencias.length; i++) {
    const p = pendencias[i];
    try {
      if (p.tipo === "locacao") await reconciliarLocacao(conn, p);
      else await reconciliarEvento(conn, p);
      processados++;
    } catch (e) {
      erros++;
      await remarcar(p.tipo, p.ref_id);
      // Conexão expirou no meio do lote: marca expirada e devolve o restante
      // à fila (nada mais será processado sem reconectar).
      if (e instanceof GoogleError && e.tipo === "auth") {
        const { marcarExpirada } = await import("./conexao");
        await marcarExpirada();
        for (let j = i + 1; j < pendencias.length; j++) {
          await remarcar(pendencias[j].tipo, pendencias[j].ref_id);
        }
        return {
          processados,
          erros,
          motivo: "Autorização do Google expirou — reconecte a conta.",
        };
      }
      // temporário/desconhecido: já re-marcado; segue para o próximo item.
    }
  }

  return { processados, erros };
}
