import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type ConfigComissoes,
  type OrigemComissao,
  parsearConfigComissoes,
} from "./comissoes-core";

/**
 * Leitura das comissões para a tela `/admin/comissoes` (Spec 21 §5). Uma função
 * de carregamento única alimenta tanto a tabela/totais quanto o CSV (gestao.ts),
 * garantindo que "os totais da tela batem com o CSV do mesmo filtro" (§6).
 */

export type StatusFiltroComissao =
  | "pendentes"
  | "exportadas"
  | "estornadas"
  | "estornadas_exportadas";

export interface FiltrosComissoes {
  /** 'YYYY-MM' ou null (todas as competências). */
  competencia: string | null;
  origem: OrigemComissao | null;
  status: StatusFiltroComissao | null;
  busca: string | null;
}

export interface ComissaoLinha {
  id: string;
  locacaoId: string;
  numero: number;
  locatario: string;
  documento: string;
  dataEventoUtc: string;
  salas: string[];
  origem: OrigemComissao;
  baseCentavos: number;
  valorCentavos: number;
  percentual: number;
  /** 'YYYY-MM'. */
  competencia: string;
  exportada: boolean;
  estornadaEmUtc: string | null;
}

export interface TotalPorOrigem {
  locacao: number;
  coffee: number;
  geral: number;
}

export interface TotaisComissoes {
  pendentes: TotalPorOrigem;
  exportadas: TotalPorOrigem;
  estornadasCentavos: number;
  estornadasExportadasQtd: number;
  qtd: number;
}

// Backstop de volume (comissões são ~2 por locação confirmada). Um mês real
// fica muito abaixo disso; "Todas" com histórico grande é o único risco.
const LIMITE = 2000;

function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function nomesDeSalas(rel: unknown): string[] {
  if (!Array.isArray(rel)) return [];
  const nomes: string[] = [];
  for (const ls of rel) {
    const s = (ls as { salas: unknown }).salas;
    const nome = Array.isArray(s)
      ? (s[0] as { nome?: string })?.nome
      : (s as { nome?: string })?.nome;
    if (nome) nomes.push(nome);
  }
  return nomes;
}

/** Resolve ids de locação por LOC-nº / nome / documento (null = sem busca). */
async function idsPorBusca(busca: string): Promise<string[]> {
  const admin = createAdminClient();
  const b = busca.trim().replace(/[,()]/g, " ");
  const ors = [
    `locatario_nome.ilike.%${b}%`,
    `locatario_documento.ilike.%${b}%`,
  ];
  const num = Number.parseInt(b.replace(/\D/g, ""), 10);
  if (!Number.isNaN(num)) ors.push(`numero.eq.${num}`);
  const { data } = await admin.from("locacoes").select("id").or(ors.join(","));
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

export async function carregarComissoes(
  f: FiltrosComissoes,
): Promise<ComissaoLinha[]> {
  const admin = createAdminClient();

  let idsBusca: string[] | null = null;
  if (f.busca && f.busca.trim().length > 0) {
    idsBusca = await idsPorBusca(f.busca);
    if (idsBusca.length === 0) return [];
  }

  let q = admin
    .from("comissoes")
    .select(
      `id, locacao_id, origem, base_centavos, valor_centavos, percentual,
       competencia, exportada, estornada_em,
       locacoes ( numero, locatario_nome, locatario_documento, inicio,
                  locacao_salas ( salas ( nome ) ) )`,
    );

  if (f.competencia) q = q.eq("competencia", `${f.competencia}-01`);
  if (f.origem) q = q.eq("origem", f.origem);

  switch (f.status) {
    case "pendentes":
      q = q.eq("exportada", false).is("estornada_em", null);
      break;
    case "exportadas":
      q = q.eq("exportada", true).is("estornada_em", null);
      break;
    case "estornadas":
      q = q.not("estornada_em", "is", null);
      break;
    case "estornadas_exportadas":
      q = q.not("estornada_em", "is", null).eq("exportada", true);
      break;
    default:
      break; // todos
  }

  if (idsBusca) q = q.in("locacao_id", idsBusca);

  q = q
    .order("competencia", { ascending: false })
    .order("criado_em", { ascending: false })
    .limit(LIMITE);

  const { data } = await q;

  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const loc = um(r.locacoes as unknown) as {
      numero?: number;
      locatario_nome?: string;
      locatario_documento?: string;
      inicio?: string;
      locacao_salas?: unknown;
    } | null;
    return {
      id: r.id as string,
      locacaoId: r.locacao_id as string,
      numero: loc?.numero ?? 0,
      locatario: loc?.locatario_nome ?? "—",
      documento: loc?.locatario_documento ?? "",
      dataEventoUtc: loc?.inicio ?? "",
      salas: nomesDeSalas(loc?.locacao_salas),
      origem: r.origem as OrigemComissao,
      baseCentavos: (r.base_centavos as number) ?? 0,
      valorCentavos: (r.valor_centavos as number) ?? 0,
      percentual: Number(r.percentual ?? 0),
      competencia: String(r.competencia).slice(0, 7),
      exportada: r.exportada === true,
      estornadaEmUtc: (r.estornada_em as string | null) ?? null,
    };
  });
}

/** Totais do recorte: pendentes vs exportadas (não estornadas), por origem. */
export function calcularTotais(linhas: ComissaoLinha[]): TotaisComissoes {
  const zero = (): TotalPorOrigem => ({ locacao: 0, coffee: 0, geral: 0 });
  const t: TotaisComissoes = {
    pendentes: zero(),
    exportadas: zero(),
    estornadasCentavos: 0,
    estornadasExportadasQtd: 0,
    qtd: linhas.length,
  };

  for (const l of linhas) {
    if (l.estornadaEmUtc) {
      t.estornadasCentavos += l.valorCentavos;
      if (l.exportada) t.estornadasExportadasQtd += 1;
      continue;
    }
    const alvo = l.exportada ? t.exportadas : t.pendentes;
    alvo[l.origem] += l.valorCentavos;
    alvo.geral += l.valorCentavos;
  }
  return t;
}

export async function lerConfigComissoes(): Promise<ConfigComissoes> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("configuracoes")
    .select("valor")
    .eq("chave", "comissoes")
    .maybeSingle();
  return parsearConfigComissoes(data?.valor);
}

/** Competências com comissões (para o seletor de mês). 'YYYY-MM' desc. */
export async function competenciasDisponiveis(): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("comissoes")
    .select("competencia")
    .order("competencia", { ascending: false })
    .limit(LIMITE);
  const vistos = new Set<string>();
  for (const r of (data ?? []) as { competencia: string }[]) {
    vistos.add(String(r.competencia).slice(0, 7));
  }
  return [...vistos];
}
