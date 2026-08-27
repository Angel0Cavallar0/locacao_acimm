import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ContagensPendencia,
  EntradaPendencia,
  SituacaoPendencia,
} from "./tipos";

/**
 * Leitura das pendências de locação sem data (sempre via admin client — RLS
 * só permite select do colaborador). Sem posição/agrupamento por data×sala
 * (diferente de lista_espera): é só intenção/prioridade registrada.
 */

type Admin = ReturnType<typeof createAdminClient>;

export type VisaoPendencia = "aguardando" | "encerradas";

interface RowPendencia {
  id: string;
  associado_id: string | null;
  nome: string;
  contato: string;
  motivo: string | null;
  observacoes: string | null;
  criado_em: string;
  convertido_locacao_id: string | null;
  arquivado_em: string | null;
  arquivado_motivo: string | null;
  arquivado_por: string | null;
  locacoes: { numero: number } | { numero: number }[] | null;
}

function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function situacaoDe(r: RowPendencia): SituacaoPendencia {
  if (r.convertido_locacao_id) return "convertida";
  if (r.arquivado_em) return "arquivada";
  return "aguardando";
}

async function nomesPorUser(
  admin: Admin,
  userIds: string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data } = await admin
    .from("colaboradores")
    .select("user_id, nome")
    .in("user_id", ids);
  return new Map(
    ((data ?? []) as { user_id: string; nome: string }[]).map((c) => [
      c.user_id,
      c.nome,
    ]),
  );
}

export async function contagensPendencia(): Promise<ContagensPendencia> {
  const admin = createAdminClient();

  const aguardando = admin
    .from("pendencias_locacao")
    .select("id", { count: "exact", head: true })
    .is("convertido_locacao_id", null)
    .is("arquivado_em", null);
  const convertidas = admin
    .from("pendencias_locacao")
    .select("id", { count: "exact", head: true })
    .not("convertido_locacao_id", "is", null);
  const arquivadas = admin
    .from("pendencias_locacao")
    .select("id", { count: "exact", head: true })
    .is("convertido_locacao_id", null)
    .not("arquivado_em", "is", null);

  const [a, c, ar] = await Promise.all([aguardando, convertidas, arquivadas]);
  return {
    aguardando: a.count ?? 0,
    encerradas: (c.count ?? 0) + (ar.count ?? 0),
  };
}

export async function listarPendencias(
  visao: VisaoPendencia,
): Promise<EntradaPendencia[]> {
  const admin = createAdminClient();

  let q = admin
    .from("pendencias_locacao")
    .select(
      `id, associado_id, nome, contato, motivo, observacoes, criado_em,
       convertido_locacao_id, arquivado_em, arquivado_motivo, arquivado_por,
       locacoes ( numero )`,
    );

  q =
    visao === "aguardando"
      ? q.is("convertido_locacao_id", null).is("arquivado_em", null)
      : q.or("convertido_locacao_id.not.is.null,arquivado_em.not.is.null");

  const { data } = await q.order("criado_em", {
    ascending: visao === "aguardando",
  });
  const rows = (data ?? []) as RowPendencia[];

  const nomes = await nomesPorUser(
    admin,
    rows.map((r) => r.arquivado_por ?? "").filter(Boolean),
  );

  return rows.map((r) => {
    const loc = um(r.locacoes);
    return {
      id: r.id,
      associadoId: r.associado_id,
      nome: r.nome,
      contato: r.contato,
      motivo: r.motivo,
      observacoes: r.observacoes,
      criadoEmUtc: r.criado_em,
      situacao: situacaoDe(r),
      convertidoLocacaoId: r.convertido_locacao_id,
      convertidoNumero: loc?.numero ?? null,
      arquivadoEmUtc: r.arquivado_em,
      arquivadoMotivo: r.arquivado_motivo,
      arquivadoPorNome: r.arquivado_por
        ? (nomes.get(r.arquivado_por) ?? null)
        : null,
    };
  });
}
