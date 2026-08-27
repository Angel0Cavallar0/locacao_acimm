"use server";

import { requireColaborador } from "@/lib/auth/guards";
import {
  arquivarCotacao,
  criarCotacao,
  type ResultadoAcaoCotacao,
  type ResultadoCotacao,
} from "@/lib/cotacoes/gestao";
import type { ResultadoCalculo } from "@/lib/locacoes/calcular";
import { gerarPdfCotacao } from "@/lib/cotacoes/pdf-cotacao";
import { rotuloCotacao } from "@/lib/cotacoes/tipos";
import { createAdminClient } from "@/lib/supabase/admin";

export async function criarCotacaoAction(input: unknown): Promise<ResultadoCotacao> {
  return criarCotacao(input);
}

export async function arquivarCotacaoAction(
  id: string,
): Promise<ResultadoAcaoCotacao> {
  return arquivarCotacao(id);
}

export async function exportarCotacaoPdfAction(
  id: string,
): Promise<{ base64: string; nome: string } | { error: string }> {
  await requireColaborador();
  const admin = createAdminClient();
  const { data: row } = await admin
    .from("cotacoes")
    .select("numero, locatario_nome, sala_ids, data, periodo, qtd_pessoas, resultado, criado_em")
    .eq("id", id)
    .maybeSingle();
  if (!row) return { error: "Cotação não encontrada." };

  const salaIds = (row.sala_ids as string[]) ?? [];
  const { data: salasRows } =
    salaIds.length > 0
      ? await admin.from("salas").select("id, nome").in("id", salaIds)
      : { data: [] as { id: string; nome: string }[] };
  const mapaSalas = new Map(
    ((salasRows ?? []) as { id: string; nome: string }[]).map((s) => [s.id, s.nome]),
  );

  const buffer = await gerarPdfCotacao({
    numero: row.numero as number,
    locatarioNome: row.locatario_nome as string,
    salas: salaIds.map((sid) => mapaSalas.get(sid) ?? "sala"),
    data: (row.data as string | null) ?? null,
    periodo: (row.periodo as string | null) ?? null,
    qtdPessoas: (row.qtd_pessoas as number | null) ?? null,
    resultado: row.resultado as ResultadoCalculo,
    criadoEmUtc: row.criado_em as string,
  });

  return {
    base64: buffer.toString("base64"),
    nome: `${rotuloCotacao(row.numero as number)}.pdf`,
  };
}
