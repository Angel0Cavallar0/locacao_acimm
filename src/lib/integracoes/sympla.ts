import "server-only";
import { getEnvSympla } from "@/lib/env";

/**
 * Integração Sympla (CLAUDE.md §6.2) — SOMENTE LEITURA.
 * Base: https://api.sympla.com.br/public/v1.5.1 (header `s_token`).
 * Retorna apenas eventos do organizador dono do token. Parser tolerante a
 * campos ausentes (a API omite `null` por padrão).
 */

const BASE = "https://api.sympla.com.br/public/v1.5.1";

export interface SymplaEvent {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  url: string | null;
}

/** Erro tipado: `config` (401 — token inválido) vs `temporario` (429/5xx). */
export class SymplaError extends Error {
  tipo: "config" | "temporario" | "desconhecido";
  constructor(tipo: SymplaError["tipo"], mensagem: string) {
    super(mensagem);
    this.name = "SymplaError";
    this.tipo = tipo;
  }
}

export function isSymplaConfigured(): boolean {
  return Boolean(process.env.SYMPLA_API_TOKEN);
}

async function symplaFetch(caminho: string): Promise<Record<string, unknown>> {
  const { apiToken } = getEnvSympla();
  let resp: Response;
  try {
    resp = await fetch(`${BASE}${caminho}`, {
      headers: { s_token: apiToken, "Content-Type": "application/json" },
    });
  } catch {
    throw new SymplaError("temporario", "Falha de rede ao consultar o Sympla.");
  }

  if (resp.status === 401 || resp.status === 403) {
    throw new SymplaError("config", "Token do Sympla inválido ou sem acesso.");
  }
  if (resp.status === 429 || resp.status >= 500) {
    throw new SymplaError("temporario", `Sympla indisponível (${resp.status}).`);
  }
  if (!resp.ok) {
    throw new SymplaError("desconhecido", `Sympla respondeu ${resp.status}.`);
  }
  return (await resp.json().catch(() => ({}))) as Record<string, unknown>;
}

function parseEvento(raw: unknown): SymplaEvent | null {
  const o = (raw ?? {}) as Record<string, unknown>;
  const id = o.id;
  if (id === undefined || id === null) return null;
  return {
    id: String(id),
    name: String(o.name ?? "Evento"),
    startDate: o.start_date ? String(o.start_date) : null,
    endDate: o.end_date ? String(o.end_date) : null,
    url: o.url ? String(o.url) : null,
  };
}

/**
 * Eventos da conta, com filtro de janela por `start_date` (aplicado no cliente
 * — robusto a variações de parâmetro da API) e `fields` enxuto. Pagina até
 * cobrir a janela ou esgotar (limite defensivo de páginas).
 */
export async function listarEventos(opts: {
  de: string; // ISO (YYYY-MM-DD)
  ate: string; // ISO (YYYY-MM-DD)
  maxPaginas?: number;
}): Promise<SymplaEvent[]> {
  const fields = encodeURIComponent("id,name,start_date,end_date,url");
  const maxPaginas = opts.maxPaginas ?? 5;
  const acumulados: SymplaEvent[] = [];

  for (let pagina = 1; pagina <= maxPaginas; pagina++) {
    const json = await symplaFetch(
      `/events?fields=${fields}&page_size=100&page=${pagina}&sort=DESC&field_sort=start_date`,
    );
    const dados = Array.isArray(json.data) ? json.data : [];
    for (const item of dados) {
      const ev = parseEvento(item);
      if (ev) acumulados.push(ev);
    }
    const pag = (json.pagination ?? {}) as Record<string, unknown>;
    if (dados.length === 0 || pag.has_next !== true) break;
  }

  // Janela por start_date (comparação de data em string ISO funciona).
  return acumulados
    .filter((e) => {
      if (!e.startDate) return true;
      const dia = e.startDate.slice(0, 10);
      return dia >= opts.de && dia <= opts.ate;
    })
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
}

/**
 * Conta inscritos de um evento. Estratégia barata: `page_size=1` e lê o total do
 * objeto de paginação (`total_page` com page_size=1 = nº de participantes).
 * Fallback: itera páginas somando `data.length` (caso o total não venha).
 */
export async function contarParticipantes(eventId: string): Promise<number> {
  const json = await symplaFetch(
    `/events/${encodeURIComponent(eventId)}/participants?page_size=1&page=1`,
  );
  const dados = Array.isArray(json.data) ? json.data : [];
  if (dados.length === 0) return 0;

  const pag = (json.pagination ?? {}) as Record<string, unknown>;
  if (typeof pag.total_page === "number" && pag.total_page > 0) {
    return pag.total_page; // page_size=1 → uma página por participante
  }
  if (typeof pag.quantity === "number") return pag.quantity;

  // Fallback: itera páginas maiores somando.
  let total = 0;
  for (let pagina = 1; pagina <= 50; pagina++) {
    const p = await symplaFetch(
      `/events/${encodeURIComponent(eventId)}/participants?page_size=100&page=${pagina}`,
    );
    const d = Array.isArray(p.data) ? p.data : [];
    total += d.length;
    const pg = (p.pagination ?? {}) as Record<string, unknown>;
    if (d.length === 0 || pg.has_next !== true) break;
  }
  return total;
}
