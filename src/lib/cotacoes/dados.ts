import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CondicaoLocatario, PeriodoDia } from "@/lib/dominio";
import type { CotacaoLista, StatusCotacao } from "./tipos";

type Admin = ReturnType<typeof createAdminClient>;

interface RowCotacao {
  id: string;
  numero: number;
  condicao: CondicaoLocatario;
  locatario_nome: string;
  sala_ids: string[];
  data: string | null;
  periodo: PeriodoDia | null;
  qtd_pessoas: number | null;
  valor_total_centavos: number;
  status: StatusCotacao;
  convertido_locacao_id: string | null;
  criado_em: string;
  locacoes: { numero: number } | { numero: number }[] | null;
}

function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

async function nomesDeSalas(
  admin: Admin,
  ids: string[],
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids)];
  if (unicos.length === 0) return new Map();
  const { data } = await admin.from("salas").select("id, nome").in("id", unicos);
  return new Map(
    ((data ?? []) as { id: string; nome: string }[]).map((s) => [s.id, s.nome]),
  );
}

export async function listarCotacoes(
  status: StatusCotacao | "todas",
): Promise<CotacaoLista[]> {
  const admin = createAdminClient();

  let q = admin
    .from("cotacoes")
    .select(
      `id, numero, condicao, locatario_nome, sala_ids, data, periodo,
       qtd_pessoas, valor_total_centavos, status, convertido_locacao_id,
       criado_em, locacoes ( numero )`,
    );
  if (status !== "todas") q = q.eq("status", status);

  const { data } = await q.order("criado_em", { ascending: false });
  const rows = (data ?? []) as RowCotacao[];

  const mapaSalas = await nomesDeSalas(
    admin,
    rows.flatMap((r) => r.sala_ids ?? []),
  );

  return rows.map((r) => {
    const loc = um(r.locacoes);
    return {
      id: r.id,
      numero: r.numero,
      condicao: r.condicao,
      locatarioNome: r.locatario_nome,
      salas: (r.sala_ids ?? []).map((id) => mapaSalas.get(id) ?? "sala"),
      data: r.data,
      periodo: r.periodo,
      qtdPessoas: r.qtd_pessoas,
      valorTotalCentavos: r.valor_total_centavos,
      status: r.status,
      convertidoLocacaoId: r.convertido_locacao_id,
      convertidoNumero: loc?.numero ?? null,
      criadoEmUtc: r.criado_em,
    };
  });
}
