import "server-only";
import { getEnvGoogle } from "@/lib/env";

/**
 * Integração Google Calendar (CLAUDE.md §6.4, Spec 18) — espelho unidirecional
 * (banco → Calendar). Wrapper fino da Calendar API v3 + OAuth 2.0 (fetch direto,
 * sem SDK). Conexão única da conta ACIMM; tokens cifrados no banco.
 *
 * Este módulo é sem estado (não toca no banco): recebe access token pronto. A
 * gestão de conexão/refresh/cifra fica em `lib/google/conexao.ts`.
 */

const OAUTH_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN = "https://oauth2.googleapis.com/token";
const OAUTH_REVOKE = "https://oauth2.googleapis.com/revoke";
const CAL_BASE = "https://www.googleapis.com/calendar/v3";

/** Escopos mínimos (§3): events p/ escrever, readonly p/ listar calendários. */
const SCOPES = [
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
];

export const TIMEZONE = "America/Sao_Paulo";

/**
 * Erro tipado:
 *  - `config`      → envs ausentes/inválidas.
 *  - `auth`        → refresh token revogado/expirado (`invalid_grant`) ou 401 →
 *                    conexão deve virar `expirada`; pendências acumulam.
 *  - `temporario`  → 403 quota / 429 / 5xx / rede → mantém a flag, próximo ciclo.
 *  - `nao_encontrado` → 404 em patch/delete (evento sumiu no Calendar).
 */
export class GoogleError extends Error {
  tipo: "config" | "auth" | "temporario" | "nao_encontrado" | "desconhecido";
  constructor(tipo: GoogleError["tipo"], mensagem: string) {
    super(mensagem);
    this.name = "GoogleError";
    this.tipo = tipo;
  }
}

export interface EventoGoogle {
  summary: string;
  description?: string;
  location?: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  attendees?: Array<{ email: string }>;
}

export type SendUpdates = "all" | "none";

export interface CalendarioGoogle {
  id: string;
  summary: string;
  primary: boolean;
}

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET &&
      process.env.GOOGLE_REDIRECT_URI &&
      process.env.TOKEN_ENCRYPTION_KEY,
  );
}

/* ------------------------------------------------------------------ */
/* OAuth                                                               */
/* ------------------------------------------------------------------ */

/** URL de consentimento. `state` assinado (CSRF) é responsabilidade do caller. */
export function gerarUrlAutorizacao(state: string): string {
  const { clientId, redirectUri } = getEnvGoogle();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent", // força refresh token mesmo em re-consentimento
    include_granted_scopes: "true",
    state,
  });
  return `${OAUTH_AUTH}?${params.toString()}`;
}

export interface TokensGoogle {
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
}

/** Troca o `code` do callback por tokens (inclui refresh na 1ª autorização). */
export async function trocarCodigoPorTokens(code: string): Promise<TokensGoogle> {
  const { clientId, clientSecret, redirectUri } = getEnvGoogle();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  let resp: Response;
  try {
    resp = await fetch(OAUTH_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new GoogleError("temporario", "Falha de rede ao trocar o código.");
  }

  const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) {
    throw new GoogleError(
      "desconhecido",
      `Troca de código falhou (${resp.status}): ${String(json.error ?? "")}`,
    );
  }
  return {
    accessToken: String(json.access_token ?? ""),
    refreshToken: json.refresh_token ? String(json.refresh_token) : null,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : 3600,
  };
}

/** Renova o access token a partir do refresh. `invalid_grant` → `auth`. */
export async function renovarAccessToken(
  refreshToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const { clientId, clientSecret } = getEnvGoogle();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  let resp: Response;
  try {
    resp = await fetch(OAUTH_TOKEN, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
  } catch {
    throw new GoogleError("temporario", "Falha de rede ao renovar o token.");
  }

  const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resp.ok) {
    if (json.error === "invalid_grant") {
      throw new GoogleError(
        "auth",
        "Autorização do Google revogada ou expirada.",
      );
    }
    throw new GoogleError("temporario", `Renovação falhou (${resp.status}).`);
  }
  return {
    accessToken: String(json.access_token ?? ""),
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : 3600,
  };
}

/** Revoga o token no Google (desconexão). Best-effort: não lança. */
export async function revogarToken(token: string): Promise<void> {
  try {
    await fetch(`${OAUTH_REVOKE}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch {
    // Revogação é cortesia; se falhar, o registro local já foi apagado.
  }
}

/* ------------------------------------------------------------------ */
/* Calendar API v3                                                     */
/* ------------------------------------------------------------------ */

function mapearStatus(status: number, contexto: string): GoogleError {
  if (status === 401) return new GoogleError("auth", `401 em ${contexto}.`);
  if (status === 404 || status === 410) {
    return new GoogleError("nao_encontrado", `Evento inexistente (${contexto}).`);
  }
  if (status === 403 || status === 429 || status >= 500) {
    return new GoogleError("temporario", `Google ${status} em ${contexto}.`);
  }
  return new GoogleError("desconhecido", `Google ${status} em ${contexto}.`);
}

async function calFetch(
  accessToken: string,
  caminho: string,
  init: RequestInit,
  contexto: string,
): Promise<Response> {
  let resp: Response;
  try {
    resp = await fetch(`${CAL_BASE}${caminho}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new GoogleError("temporario", `Falha de rede em ${contexto}.`);
  }
  if (!resp.ok) throw mapearStatus(resp.status, contexto);
  return resp;
}

/** Lista os calendários da conta (para escolher o alvo). Requer readonly. */
export async function listarCalendarios(
  accessToken: string,
): Promise<CalendarioGoogle[]> {
  const resp = await calFetch(
    accessToken,
    "/users/me/calendarList?fields=items(id,summary,primary)&minAccessRole=writer",
    { method: "GET" },
    "listar calendários",
  );
  const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  const items = Array.isArray(json.items) ? json.items : [];
  return items.map((raw) => {
    const o = (raw ?? {}) as Record<string, unknown>;
    return {
      id: String(o.id ?? ""),
      summary: String(o.summary ?? o.id ?? ""),
      primary: o.primary === true,
    };
  });
}

/** E-mail da conta conectada = id do calendário `primary`. */
export async function obterEmailConta(accessToken: string): Promise<string> {
  const cals = await listarCalendarios(accessToken);
  const primary = cals.find((c) => c.primary);
  return primary?.id ?? "";
}

function calendarioPath(calendarId: string): string {
  return `/calendars/${encodeURIComponent(calendarId)}/events`;
}

/** Cria o evento; retorna o `id` do evento no Google. */
export async function criarEvento(
  accessToken: string,
  calendarId: string,
  corpo: EventoGoogle,
  sendUpdates: SendUpdates,
): Promise<string> {
  const resp = await calFetch(
    accessToken,
    `${calendarioPath(calendarId)}?sendUpdates=${sendUpdates}`,
    { method: "POST", body: JSON.stringify(corpo) },
    "criar evento",
  );
  const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
  const id = json.id ? String(json.id) : "";
  if (!id) throw new GoogleError("desconhecido", "Criação sem id de evento.");
  return id;
}

/** Atualiza (PATCH) o evento. 404 → `GoogleError('nao_encontrado')` (§4). */
export async function atualizarEvento(
  accessToken: string,
  calendarId: string,
  eventId: string,
  corpo: EventoGoogle,
  sendUpdates: SendUpdates,
): Promise<void> {
  await calFetch(
    accessToken,
    `${calendarioPath(calendarId)}/${encodeURIComponent(eventId)}?sendUpdates=${sendUpdates}`,
    { method: "PATCH", body: JSON.stringify(corpo) },
    "atualizar evento",
  );
}

/** Remove o evento. 404/410 (já removido) é tratado como sucesso. */
export async function removerEvento(
  accessToken: string,
  calendarId: string,
  eventId: string,
  sendUpdates: SendUpdates,
): Promise<void> {
  try {
    await calFetch(
      accessToken,
      `${calendarioPath(calendarId)}/${encodeURIComponent(eventId)}?sendUpdates=${sendUpdates}`,
      { method: "DELETE" },
      "remover evento",
    );
  } catch (e) {
    if (e instanceof GoogleError && e.tipo === "nao_encontrado") return;
    throw e;
  }
}
