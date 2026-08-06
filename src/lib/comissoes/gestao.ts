import "server-only";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireColaborador } from "@/lib/auth/guards";
import { dataSP } from "@/lib/calendario/tempo";
import { FORMA_PAGAMENTO_ROTULO, rotuloLocacao } from "@/lib/locacoes/tipos";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  configComissoesSchema,
  filtroVisaoComissoesSchema,
  marcarPagaComissoesSchema,
} from "@/lib/validacoes/comissoes";
import type { FormaPagamento } from "@/lib/locacoes/tipos";
import type { OrigemComissao } from "./comissoes-core";
import { montarCsvComissoes } from "./csv-core";
import {
  carregarReconciliacao,
  carregarVisaoComissoes,
  type VisaoComissao,
} from "./dados";

/** Gestão da tela de comissões (Ciclo 2 / Spec 29 §5). */

const CAMINHO = "/admin/comissoes";

const ORIGEM_ROTULO: Record<OrigemComissao, string> = {
  locacao: "Locação",
  coffee: "Coffee break",
};

const VISAO_SUFIXO: Record<VisaoComissao, string> = {
  a_pagar: "a_pagar",
  proximo_mes: "proximo_mes",
  dois_meses: "dois_meses",
};

function rotuloForma(forma: string | null): string {
  if (!forma) return "";
  if (forma === "multiplas") return "Múltiplas formas";
  return FORMA_PAGAMENTO_ROTULO[forma as FormaPagamento] ?? forma;
}

export type ResultadoExport =
  | { ok: true; csv: string; filename: string; linhas: number }
  | { erro: string };

/**
 * Gera o CSV da visão filtrada (§5). Reusa `carregarVisaoComissoes` (mesmo
 * recorte da tela → totais batem com o arquivo). Não marca nada: o controle
 * pago/não-pago é ação própria; o CSV é somente leitura.
 */
export async function exportarComissoes(
  input: unknown,
): Promise<ResultadoExport> {
  await requireColaborador();
  const parsed = filtroVisaoComissoesSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Filtro inválido." };
  }

  const { visao, origem, busca } = parsed.data;
  const dados = await carregarVisaoComissoes(visao, { origem, busca });

  const csv = montarCsvComissoes(
    dados.linhas.map((l) => ({
      competencia: l.competencia,
      locNumero: rotuloLocacao(l.numero),
      locatario: l.locatario,
      documento: l.documento,
      salas: l.salas.join(", "),
      origem: ORIGEM_ROTULO[l.origem] ?? l.origem,
      recebidoEm: l.recebidoEmUtc ? dataSP(l.recebidoEmUtc) : "",
      formaPagamento: rotuloForma(l.formaPagamento),
      baseCentavos: l.baseCentavos,
      valorCentavos: l.valorCentavos,
      pago: l.tipo === "previsao" ? "" : l.pago ? "Sim" : "Não",
    })),
  );

  return {
    ok: true,
    csv,
    filename: `comissoes_${VISAO_SUFIXO[visao]}.csv`,
    linhas: dados.linhas.length,
  };
}

export type ResultadoMarcar = { ok: true; alteradas: number } | { erro: string };

/** Marca/desmarca comissões (reais) como pagas ao colaborador (§5). */
export async function marcarComissoesPagas(
  input: unknown,
): Promise<ResultadoMarcar> {
  const { user } = await requireColaborador();
  const parsed = marcarPagaComissoesSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const admin = createAdminClient();
  const agora = new Date().toISOString();
  const { data, error } = await admin
    .from("comissoes")
    .update(
      parsed.data.pago
        ? { pago: true, pago_em: agora, pago_por: user.id }
        : { pago: false, pago_em: null, pago_por: null },
    )
    .in("id", parsed.data.ids)
    .is("estornada_em", null)
    .select("id");
  if (error) return { erro: "Não foi possível atualizar as comissões." };

  revalidatePath(CAMINHO);
  return { ok: true, alteradas: (data ?? []).length };
}

export type ResultadoReparo =
  | { ok: true; geradas: number }
  | { erro: string };

/**
 * Reconciliação (§4.3): regenera as comissões das locações confirmadas com
 * recebimento e sem comissão viva (efeito best-effort que falhou). Idempotente.
 */
export async function repararComissoes(): Promise<ResultadoReparo> {
  await requireColaborador();
  const { pendentes } = await carregarReconciliacao();
  if (pendentes.length === 0) return { ok: true, geradas: 0 };

  const { gerarComissoesConfirmada } = await import("./geracao");
  for (const p of pendentes) {
    await gerarComissoesConfirmada(p.locacaoId);
  }
  revalidatePath(CAMINHO);
  return { ok: true, geradas: pendentes.length };
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
