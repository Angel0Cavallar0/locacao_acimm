import "server-only";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireColaborador } from "@/lib/auth/guards";
import { dataSP } from "@/lib/calendario/tempo";
import { rotuloLocacao } from "@/lib/locacoes/tipos";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  configComissoesSchema,
  filtroExportComissoesSchema,
} from "@/lib/validacoes/comissoes";
import type { OrigemComissao } from "./comissoes-core";
import { montarCsvComissoes } from "./csv-core";
import { carregarComissoes, type FiltrosComissoes } from "./dados";

/** Gestão da tela de comissões (Spec 21 §5): exportação CSV e config. */

const CAMINHO = "/admin/comissoes";

const ORIGEM_ROTULO: Record<OrigemComissao, string> = {
  locacao: "Locação",
  coffee: "Coffee break",
};

export type ResultadoExport =
  | { ok: true; csv: string; filename: string; marcadas: number; linhas: number }
  | { erro: string };

/**
 * Gera o CSV do recorte filtrado (§5). Inclui SÓ linhas não estornadas; com a
 * exportação, marca `exportada = true` nas ainda-não-exportadas (re-exportar as
 * já exportadas é permitido e não remarca). O mesmo `carregarComissoes` da tela
 * é reusado → os totais exibidos batem com o conteúdo do arquivo.
 */
export async function exportarComissoes(
  input: unknown,
): Promise<ResultadoExport> {
  await requireColaborador();
  const parsed = filtroExportComissoesSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Filtro inválido." };
  }

  const filtros: FiltrosComissoes = {
    competencia: parsed.data.competencia,
    origem: parsed.data.origem,
    status: parsed.data.status,
    busca: parsed.data.busca,
  };

  const todas = await carregarComissoes(filtros);
  const linhas = todas.filter((l) => !l.estornadaEmUtc);

  const csv = montarCsvComissoes(
    linhas.map((l) => ({
      competencia: l.competencia,
      locNumero: rotuloLocacao(l.numero),
      locatario: l.locatario,
      documento: l.documento,
      dataEvento: l.dataEventoUtc ? dataSP(l.dataEventoUtc) : "",
      salas: l.salas.join(", "),
      origem: ORIGEM_ROTULO[l.origem] ?? l.origem,
      baseCentavos: l.baseCentavos,
      valorCentavos: l.valorCentavos,
    })),
  );

  // Marca as ainda-não-exportadas incluídas neste CSV.
  const paraMarcar = linhas.filter((l) => !l.exportada).map((l) => l.id);
  let marcadas = 0;
  if (paraMarcar.length > 0) {
    const admin = createAdminClient();
    const { error } = await admin
      .from("comissoes")
      .update({ exportada: true })
      .in("id", paraMarcar);
    if (error) return { erro: "Não foi possível marcar como exportadas." };
    marcadas = paraMarcar.length;
    revalidatePath(CAMINHO);
  }

  const sufixo = filtros.competencia ?? "todas";
  return {
    ok: true,
    csv,
    filename: `comissoes_${sufixo}.csv`,
    marcadas,
    linhas: linhas.length,
  };
}

export type ResultadoConfig = { ok: true } | { erro: string };

/** Salva os percentuais/toggles por origem (§5). Admin only. */
export async function salvarConfigComissoes(
  input: unknown,
): Promise<ResultadoConfig> {
  const { user } = await requireAdmin();
  const parsed = configComissoesSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const admin = createAdminClient();
  const { error } = await admin.from("configuracoes").upsert(
    {
      chave: "comissoes",
      valor: parsed.data,
      atualizado_por: user.id,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "chave" },
  );
  if (error) return { erro: "Não foi possível salvar a configuração." };

  revalidatePath(CAMINHO);
  return { ok: true };
}
