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
import { competenciasAbertasComLinhas, reapurarCompetencias } from "./apuracao";
import { serializarConfigComissoes } from "./apuracao-core";
import { competenciaDoMes, type OrigemComissao } from "./comissoes-core";
import { montarCsvComissoes } from "./csv-core";
import {
  carregarReconciliacao,
  carregarVisaoComissoes,
  type VisaoComissao,
} from "./dados";

/** Gestão da tela de comissões (Ciclo 3 / Spec 33 §9). */

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

/** '6' / '7,5' — decimal com vírgula, para o Excel pt-BR. */
function percentualBR(p: number): string {
  return String(p).replace(".", ",");
}

export type ResultadoExport =
  | { ok: true; csv: string; filename: string; linhas: number }
  | { erro: string };

/**
 * Gera o CSV da visão filtrada. Reusa `carregarVisaoComissoes` (mesmo recorte da
 * tela → totais batem com o arquivo). O `bonus_aplicado` vem do cabeçalho da
 * competência da linha, não da linha.
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

  // Cabeçalhos das competências presentes no recorte (bônus + status).
  const competencias = [
    ...new Set(
      dados.linhas
        .filter((l) => l.tipo === "real")
        .map((l) => competenciaDoMes(l.competencia)),
    ),
  ];
  const bonusPorCompetencia = new Map<string, boolean>();
  if (competencias.length > 0) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("comissao_competencias")
      .select("competencia, bonus_aplicado")
      .in("competencia", competencias);
    for (const c of (data ?? []) as {
      competencia: string;
      bonus_aplicado: boolean;
    }[]) {
      bonusPorCompetencia.set(
        String(c.competencia).slice(0, 7),
        c.bonus_aplicado === true,
      );
    }
  }

  const csv = montarCsvComissoes(
    dados.linhas.map((l) => {
      const previsao = l.tipo === "previsao";
      return {
        competencia: l.competencia,
        locNumero: rotuloLocacao(l.numero),
        locatario: l.locatario,
        documento: l.documento,
        salas: l.salas.join(", "),
        origem: ORIGEM_ROTULO[l.origem] ?? l.origem,
        recebidoEm: l.recebidoEmUtc ? dataSP(l.recebidoEmUtc) : "",
        formaPagamento: rotuloForma(l.formaPagamento),
        baseCentavos: l.baseCentavos,
        percentual: percentualBR(l.percentual),
        valorCentavos: l.valorCentavos,
        bonusAplicado: previsao
          ? ""
          : bonusPorCompetencia.get(l.competencia)
            ? "Sim"
            : "Não",
        competenciaStatus: previsao
          ? "Previsão"
          : l.competenciaFechada
            ? "Fechada"
            : "Em apuração",
        competenciaOriginal: l.competenciaOriginal ?? "",
        pago: previsao ? "" : l.pago ? "Sim" : "Não",
      };
    }),
  );

  return {
    ok: true,
    csv,
    filename: `comissoes_${VISAO_SUFIXO[visao]}.csv`,
    linhas: dados.linhas.length,
  };
}

export type ResultadoMarcar = { ok: true; alteradas: number } | { erro: string };

/**
 * Marca/desmarca comissões (reais) como pagas ao colaborador.
 *
 * Ciclo 3: só em competência FECHADA. Sem esse gate, uma linha paga a 5% no dia
 * 12 vira 6% na reapuração do dia 20 e o valor pago diverge do gravado, sem
 * rastro. Desmarcar é sempre permitido — é o escape para reabrir a competência.
 */
export async function marcarComissoesPagas(
  input: unknown,
): Promise<ResultadoMarcar> {
  const { user } = await requireColaborador();
  const parsed = marcarPagaComissoesSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const admin = createAdminClient();

  if (parsed.data.pago) {
    const { data: linhas } = await admin
      .from("comissoes")
      .select("competencia")
      .in("id", parsed.data.ids)
      .is("estornada_em", null);

    const competencias = [
      ...new Set(
        ((linhas ?? []) as { competencia: string }[]).map((l) =>
          String(l.competencia).slice(0, 10),
        ),
      ),
    ];
    if (competencias.length > 0) {
      const { data: cabs } = await admin
        .from("comissao_competencias")
        .select("competencia, fechada_em")
        .in("competencia", competencias);
      const fechadas = new Set(
        ((cabs ?? []) as { competencia: string; fechada_em: string | null }[])
          .filter((c) => c.fechada_em)
          .map((c) => String(c.competencia).slice(0, 10)),
      );
      const abertas = competencias.filter((c) => !fechadas.has(c));
      if (abertas.length > 0) {
        const meses = abertas
          .map((c) => c.slice(5, 7) + "/" + c.slice(0, 4))
          .join(", ");
        return {
          erro: `Feche a competência ${meses} antes de marcar as comissões como pagas — os valores ainda podem mudar.`,
        };
      }
    }
  }

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
 * Reconciliação: regenera as comissões das locações confirmadas com recebimento
 * e sem comissão viva (efeito best-effort que falhou). Idempotente. A reapuração
 * roda UMA vez por competência distinta, depois do loop — não N vezes.
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

export type ResultadoConfig = { ok: true; reapuradas: string[] } | { erro: string };

/**
 * Salva faixas, metas e bônus. Admin only.
 *
 * Ciclo 3: alterar a config AGORA recalcula as competências ainda ABERTAS (o
 * percentual é do mês, não da linha). Competências fechadas ficam congeladas com
 * o `config_snapshot` do fechamento.
 */
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
      valor: serializarConfigComissoes(parsed.data),
      atualizado_por: user.id,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "chave" },
  );
  if (error) return { erro: "Não foi possível salvar a configuração." };

  const abertas = await competenciasAbertasComLinhas();
  await reapurarCompetencias(abertas);

  revalidatePath(CAMINHO);
  return { ok: true, reapuradas: abertas.map((c) => c.slice(0, 7)).sort() };
}
