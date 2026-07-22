import "server-only";
import { getEnvEvolution } from "@/lib/env";

/**
 * Integração Evolution API v2 (CLAUDE.md §6.5) — WhatsApp transacional.
 * Chamada direta à API REST. Nenhum conteúdo menciona ferramentas/stack.
 */

export function isEvolutionConfigured(): boolean {
  return Boolean(
    process.env.EVOLUTION_API_URL &&
      process.env.EVOLUTION_API_KEY &&
      process.env.EVOLUTION_INSTANCE,
  );
}

/** Estado da sessão do número na instância (mapeado da Evolution). */
export type EstadoConexaoWhatsapp =
  | "open"
  | "close"
  | "connecting"
  | "desconhecido";

/** Monta a base da URL da instância e os headers padrão de gestão. */
function baseInstancia() {
  const { apiUrl, apiKey, instance } = getEnvEvolution();
  return {
    root: apiUrl.replace(/\/$/, ""),
    apiKey,
    instance: encodeURIComponent(instance),
  };
}

/**
 * Estado atual da conexão do número via `GET /instance/connectionState`.
 * Não lança: qualquer falha/estado ausente vira "desconhecido" para nunca
 * quebrar a tela de configuração.
 */
export async function obterEstadoInstancia(): Promise<EstadoConexaoWhatsapp> {
  try {
    const { root, apiKey, instance } = baseInstancia();
    const resp = await fetch(
      `${root}/instance/connectionState/${instance}`,
      { method: "GET", headers: { apikey: apiKey }, cache: "no-store" },
    );
    if (!resp.ok) return "desconhecido";
    const data = (await resp.json().catch(() => null)) as {
      instance?: { state?: string };
    } | null;
    const state = data?.instance?.state;
    if (state === "open" || state === "close" || state === "connecting") {
      return state;
    }
    return "desconhecido";
  } catch {
    return "desconhecido";
  }
}

/**
 * Número/perfil conectado, best-effort via `GET /instance/fetchInstances`.
 * Depende de a chave ter permissão de gestão; falha silenciosa → nulos.
 */
export async function obterInfoInstancia(): Promise<{
  numero: string | null;
  perfil: string | null;
}> {
  const vazio = { numero: null, perfil: null };
  try {
    const { root, apiKey } = baseInstancia();
    const { instance } = getEnvEvolution();
    const resp = await fetch(
      `${root}/instance/fetchInstances?instanceName=${encodeURIComponent(instance)}`,
      { method: "GET", headers: { apikey: apiKey }, cache: "no-store" },
    );
    if (!resp.ok) return vazio;
    const data = (await resp.json().catch(() => null)) as unknown;
    // A Evolution v2 retorna um array; formatos variam entre versões
    // (campos no topo ou aninhados em `instance`). Normalizamos os dois.
    const arr = Array.isArray(data) ? data : data ? [data] : [];
    const alvo = arr.find((raw) => {
      const it = raw as Record<string, unknown>;
      const nested = (it.instance ?? {}) as Record<string, unknown>;
      const nome = (it.name ?? nested.instanceName ?? nested.name) as
        | string
        | undefined;
      return nome === instance;
    }) as Record<string, unknown> | undefined;
    const it = (alvo ?? arr[0]) as Record<string, unknown> | undefined;
    if (!it) return vazio;
    const nested = (it.instance ?? {}) as Record<string, unknown>;
    const ownerJid = (it.ownerJid ?? nested.owner ?? nested.ownerJid) as
      | string
      | undefined;
    const perfil = (it.profileName ?? nested.profileName) as
      | string
      | undefined;
    // ownerJid vem como "5511999999999@s.whatsapp.net" — só os dígitos.
    const numero = ownerJid ? (ownerJid.split("@")[0] ?? null) : null;
    return { numero: numero || null, perfil: perfil || null };
  } catch {
    return vazio;
  }
}

/**
 * Inicia o pareamento via `GET /instance/connect` e devolve o QR code
 * (imagem base64 pronta para <img>) e/ou o código de pareamento alternativo.
 * Quando a instância já está conectada, a Evolution pode responder sem QR —
 * nesse caso ambos os campos vêm nulos. Lança só em falha de rede/HTTP.
 */
export async function conectarInstancia(): Promise<{
  base64: string | null;
  pairingCode: string | null;
}> {
  const { root, apiKey, instance } = baseInstancia();
  const resp = await fetch(`${root}/instance/connect/${instance}`, {
    method: "GET",
    headers: { apikey: apiKey },
    cache: "no-store",
  });

  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => "");
    throw new Error(
      `Conexão do WhatsApp falhou (${resp.status}): ${detalhe.slice(0, 300)}`,
    );
  }

  const data = (await resp.json().catch(() => null)) as {
    base64?: string;
    pairingCode?: string;
    code?: string;
    qrcode?: { base64?: string; pairingCode?: string; code?: string };
  } | null;

  const rawBase64 = data?.base64 ?? data?.qrcode?.base64 ?? null;
  const base64 = rawBase64 ? normalizarDataUri(rawBase64) : null;
  const pairingCode =
    data?.pairingCode ?? data?.qrcode?.pairingCode ?? null;

  return { base64, pairingCode };
}

/** Garante o prefixo data URI (a Evolution às vezes envia o base64 cru). */
function normalizarDataUri(base64: string): string {
  return base64.startsWith("data:")
    ? base64
    : `data:image/png;base64,${base64}`;
}

/** Encerra a sessão do número (`POST /instance/logout`), mantendo a instância. */
export async function desconectarInstancia(): Promise<void> {
  const { root, apiKey, instance } = baseInstancia();
  const resp = await fetch(`${root}/instance/logout/${instance}`, {
    method: "POST",
    headers: { apikey: apiKey },
  });
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => "");
    throw new Error(
      `Desconexão do WhatsApp falhou (${resp.status}): ${detalhe.slice(0, 300)}`,
    );
  }
}

/** Reinicia a instância (`POST /instance/restart`) sem deslogar o número. */
export async function reiniciarInstancia(): Promise<void> {
  const { root, apiKey, instance } = baseInstancia();
  const resp = await fetch(`${root}/instance/restart/${instance}`, {
    method: "POST",
    headers: { apikey: apiKey },
  });
  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => "");
    throw new Error(
      `Reinício do WhatsApp falhou (${resp.status}): ${detalhe.slice(0, 300)}`,
    );
  }
}

/**
 * Envia texto simples ao número já normalizado (55 + DDD + 9 + 8 dígitos).
 * Lança em falha de rede/HTTP — quem chama decide sobre retry.
 */
export async function enviarWhatsappTexto(
  numero: string,
  texto: string,
): Promise<void> {
  const { apiUrl, apiKey, instance } = getEnvEvolution();

  const resp = await fetch(
    `${apiUrl.replace(/\/$/, "")}/message/sendText/${encodeURIComponent(instance)}`,
    {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ number: numero, text: texto }),
    },
  );

  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => "");
    throw new Error(
      `Evolution falhou (${resp.status}): ${detalhe.slice(0, 300)}`,
    );
  }
}

/**
 * Envia um documento (PDF) por URL como mídia ao número normalizado. Usado pelo
 * PDF semanal de compras do coffee (Spec 16). A Evolution baixa o arquivo da URL
 * assinada e o envia como documento com legenda.
 */
export async function enviarWhatsappMidia(
  numero: string,
  opts: { url: string; caption?: string; filename?: string },
): Promise<void> {
  const { apiUrl, apiKey, instance } = getEnvEvolution();

  const resp = await fetch(
    `${apiUrl.replace(/\/$/, "")}/message/sendMedia/${encodeURIComponent(instance)}`,
    {
      method: "POST",
      headers: {
        apikey: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        number: numero,
        mediatype: "document",
        media: opts.url,
        fileName: opts.filename ?? "documento.pdf",
        caption: opts.caption ?? "",
      }),
    },
  );

  if (!resp.ok) {
    const detalhe = await resp.text().catch(() => "");
    throw new Error(
      `Evolution (mídia) falhou (${resp.status}): ${detalhe.slice(0, 300)}`,
    );
  }
}
