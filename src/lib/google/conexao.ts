import "server-only";
import {
  type CalendarioGoogle,
  GoogleError,
  listarCalendarios,
  renovarAccessToken,
  revogarToken,
} from "@/lib/integracoes/google";
import { createAdminClient } from "@/lib/supabase/admin";
import { cifrar, decifrar } from "@/lib/utils/crypto";

/**
 * Conexão única (singleton) da conta Google da ACIMM (Spec 18 §3). Guarda o
 * refresh token CIFRADO (AES-256-GCM) e o calendário alvo. Toda a aquisição de
 * access token passa por aqui, com cache curto em memória.
 */

export type StatusConexao = "ativa" | "expirada";

export interface ConexaoGoogle {
  contaEmail: string;
  calendarioId: string;
  status: StatusConexao;
  conectadoPor: string | null;
  atualizadoEm: string;
}

interface ConexaoRow {
  conta_email: string;
  calendario_id: string;
  refresh_token_cifrado: string;
  status: string;
  conectado_por: string | null;
  atualizado_em: string;
}

/** Cache do access token em memória (curto). Limpo em qualquer mudança de conexão. */
let cacheToken: { token: string; exp: number } | null = null;
function limparCacheToken() {
  cacheToken = null;
}

async function lerRow(): Promise<ConexaoRow | null> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("google_conexoes")
    .select(
      "conta_email, calendario_id, refresh_token_cifrado, status, conectado_por, atualizado_em",
    )
    .eq("singleton", true)
    .maybeSingle();
  return (data as ConexaoRow | null) ?? null;
}

export async function carregarConexao(): Promise<ConexaoGoogle | null> {
  const row = await lerRow();
  if (!row) return null;
  return {
    contaEmail: row.conta_email,
    calendarioId: row.calendario_id,
    status: row.status === "expirada" ? "expirada" : "ativa",
    conectadoPor: row.conectado_por ?? null,
    atualizadoEm: row.atualizado_em,
  };
}

/** Conta pendências de espelho (locações + eventos) para o painel de status. */
export async function contarPendencias(): Promise<number> {
  const admin = createAdminClient();
  const [l, e] = await Promise.all([
    admin
      .from("locacoes")
      .select("id", { count: "exact", head: true })
      .eq("google_sync_pendente", true),
    admin
      .from("eventos_internos")
      .select("id", { count: "exact", head: true })
      .eq("google_sync_pendente", true),
  ]);
  return (l.count ?? 0) + (e.count ?? 0);
}

/**
 * Grava/atualiza a conexão após o callback OAuth. Cifra o refresh token; se o
 * Google não devolver refresh novo (re-consentimento), preserva o anterior.
 */
export async function salvarConexao(params: {
  contaEmail: string;
  refreshToken: string | null;
  calendarioId?: string;
  conectadoPor: string;
}): Promise<void> {
  const admin = createAdminClient();
  const atual = await lerRow();

  const refreshParaGravar = params.refreshToken
    ? cifrar(params.refreshToken)
    : atual?.refresh_token_cifrado;
  if (!refreshParaGravar) {
    throw new GoogleError(
      "auth",
      "Google não retornou refresh token — refaça a autorização com consentimento.",
    );
  }

  await admin.from("google_conexoes").upsert(
    {
      singleton: true,
      conta_email: params.contaEmail,
      calendario_id: params.calendarioId ?? atual?.calendario_id ?? "primary",
      refresh_token_cifrado: refreshParaGravar,
      status: "ativa",
      conectado_por: params.conectadoPor,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "singleton" },
  );
  limparCacheToken();
}

export async function atualizarCalendario(calendarioId: string): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("google_conexoes")
    .update({ calendario_id: calendarioId, atualizado_em: new Date().toISOString() })
    .eq("singleton", true);
  limparCacheToken();
}

export async function marcarExpirada(): Promise<void> {
  const admin = createAdminClient();
  await admin
    .from("google_conexoes")
    .update({ status: "expirada", atualizado_em: new Date().toISOString() })
    .eq("singleton", true);
  limparCacheToken();
}

/** Desconecta: revoga no Google (best-effort) e apaga o registro local. */
export async function desconectar(): Promise<void> {
  const admin = createAdminClient();
  const row = await lerRow();
  if (row?.refresh_token_cifrado) {
    try {
      await revogarToken(decifrar(row.refresh_token_cifrado));
    } catch {
      // Revogação é cortesia; segue apagando o registro local.
    }
  }
  await admin.from("google_conexoes").delete().eq("singleton", true);
  limparCacheToken();
}

/**
 * Access token pronto para uso + calendário alvo. Renova via refresh (cache
 * curto). Sem conexão ou status `expirada` → null (o processador no-op e as
 * pendências acumulam). `invalid_grant` → marca `expirada` e retorna null.
 */
export async function obterConexaoAtiva(): Promise<{
  accessToken: string;
  calendarId: string;
} | null> {
  const row = await lerRow();
  if (!row || row.status === "expirada") return null;

  if (cacheToken && cacheToken.exp > Date.now()) {
    return { accessToken: cacheToken.token, calendarId: row.calendario_id };
  }

  let refresh: string;
  try {
    refresh = decifrar(row.refresh_token_cifrado);
  } catch {
    // Chave de cifra trocada/ausente → não há como usar o token.
    await marcarExpirada();
    return null;
  }

  try {
    const { accessToken, expiresIn } = await renovarAccessToken(refresh);
    cacheToken = { token: accessToken, exp: Date.now() + (expiresIn - 60) * 1000 };
    return { accessToken, calendarId: row.calendario_id };
  } catch (e) {
    if (e instanceof GoogleError && e.tipo === "auth") {
      await marcarExpirada();
      return null;
    }
    throw e; // temporário → o caller mantém as flags para o próximo ciclo
  }
}

/** Calendários da conta conectada (para o select de calendário alvo). */
export async function listarCalendariosConta(): Promise<CalendarioGoogle[]> {
  const conn = await obterConexaoAtiva();
  if (!conn) return [];
  return listarCalendarios(conn.accessToken);
}
