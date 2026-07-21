import "server-only";
import { hojeSP } from "@/lib/disponibilidade/janela";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ContagensFila,
  EntradaFila,
  SituacaoFila,
  VisaoFila,
} from "./tipos";

/**
 * Leitura da lista de espera para o painel (Spec 19 §3). Sempre via admin client
 * (RLS só permite select do colaborador; escrita é service role). A posição é
 * calculada aqui, dentro do grupo data×sala, na ordem de chegada.
 */

type Admin = ReturnType<typeof createAdminClient>;

export interface FiltroFila {
  visao: VisaoFila;
  salaId?: string | null;
  de?: string | null; // 'YYYY-MM-DD'
  ate?: string | null; // 'YYYY-MM-DD'
}

interface RowFila {
  id: string;
  sala_id: string | null;
  data: string;
  associado_id: string | null;
  nome: string;
  contato: string;
  observacoes: string | null;
  criado_em: string;
  convertido_locacao_id: string | null;
  arquivado_em: string | null;
  arquivado_motivo: string | null;
  arquivado_por: string | null;
  salas: { nome: string } | { nome: string }[] | null;
  locacoes: { numero: number } | { numero: number }[] | null;
}

function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function situacaoDe(r: RowFila, hoje: string): SituacaoFila {
  if (r.convertido_locacao_id) return "convertida";
  if (r.arquivado_em) return "arquivada";
  return r.data < hoje ? "vencida" : "aguardando";
}

/** Nome do colaborador que arquivou (auth.users não é consultável via join). */
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

export async function contagensFila(): Promise<ContagensFila> {
  const admin = createAdminClient();
  const hoje = hojeSP();

  const aguardando = admin
    .from("lista_espera")
    .select("id", { count: "exact", head: true })
    .is("convertido_locacao_id", null)
    .is("arquivado_em", null)
    .gte("data", hoje);
  const vencidas = admin
    .from("lista_espera")
    .select("id", { count: "exact", head: true })
    .is("convertido_locacao_id", null)
    .is("arquivado_em", null)
    .lt("data", hoje);
  // Encerradas = convertidas OU arquivadas.
  const convertidas = admin
    .from("lista_espera")
    .select("id", { count: "exact", head: true })
    .not("convertido_locacao_id", "is", null);
  const arquivadas = admin
    .from("lista_espera")
    .select("id", { count: "exact", head: true })
    .is("convertido_locacao_id", null)
    .not("arquivado_em", "is", null);

  const [a, v, c, ar] = await Promise.all([
    aguardando,
    vencidas,
    convertidas,
    arquivadas,
  ]);
  return {
    aguardando: a.count ?? 0,
    vencidas: v.count ?? 0,
    encerradas: (c.count ?? 0) + (ar.count ?? 0),
  };
}

export async function listarFila(filtro: FiltroFila): Promise<EntradaFila[]> {
  const admin = createAdminClient();
  const hoje = hojeSP();

  let q = admin
    .from("lista_espera")
    .select(
      `id, sala_id, data, associado_id, nome, contato, observacoes, criado_em,
       convertido_locacao_id, arquivado_em, arquivado_motivo, arquivado_por,
       salas ( nome ), locacoes ( numero )`,
    );

  if (filtro.visao === "aguardando") {
    q = q.is("convertido_locacao_id", null).is("arquivado_em", null).gte("data", hoje);
  } else if (filtro.visao === "vencidas") {
    q = q.is("convertido_locacao_id", null).is("arquivado_em", null).lt("data", hoje);
  } else {
    // Encerradas: convertidas OU arquivadas.
    q = q.or("convertido_locacao_id.not.is.null,arquivado_em.not.is.null");
  }

  if (filtro.salaId) q = q.eq("sala_id", filtro.salaId);
  if (filtro.de) q = q.gte("data", filtro.de);
  if (filtro.ate) q = q.lte("data", filtro.ate);

  const { data } = await q
    .order("data", { ascending: filtro.visao !== "encerradas" })
    .order("criado_em", { ascending: true });

  const rows = (data ?? []) as RowFila[];

  const nomes = await nomesPorUser(
    admin,
    rows.map((r) => r.arquivado_por ?? "").filter(Boolean),
  );

  // Posição por grupo data×sala (só entre as entradas ainda vivas na fila).
  const contadorGrupo = new Map<string, number>();

  return rows.map((r) => {
    const situacao = situacaoDe(r, hoje);
    let posicao = 0;
    if (situacao === "aguardando" || situacao === "vencida") {
      const chave = `${r.data}|${r.sala_id ?? "q"}`;
      posicao = (contadorGrupo.get(chave) ?? 0) + 1;
      contadorGrupo.set(chave, posicao);
    }
    const loc = um(r.locacoes);
    return {
      id: r.id,
      salaId: r.sala_id,
      salaNome: um(r.salas)?.nome ?? null,
      data: r.data,
      associadoId: r.associado_id,
      nome: r.nome,
      contato: r.contato,
      observacoes: r.observacoes,
      criadoEmUtc: r.criado_em,
      posicao,
      situacao,
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
