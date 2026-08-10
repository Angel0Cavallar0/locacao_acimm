import "server-only";
import { revalidatePath } from "next/cache";
import { requireAdmin, requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  apurarCompetencia,
  type BasesCompetencia,
  type ConfigComissoes,
  serializarConfigComissoes,
} from "./apuracao-core";
import { competenciaDoMes, type OrigemComissao } from "./comissoes-core";
import { competenciasFechadas, lerConfigComissoes } from "./dados";

/**
 * Apuração mensal das comissões (Spec 33 §7). O percentual é do MÊS: sempre que
 * uma linha entra, sai ou a config muda, a competência inteira é reapurada — até
 * ser FECHADA, quando congela para pagamento.
 *
 * A decisão (qual faixa, tem bônus) é tomada aqui em TS; a RPC
 * `apurar_comissao_competencia` só aplica `floor(base * pct / 100)` nas linhas e
 * grava o cabeçalho na MESMA transação, sob advisory lock por competência.
 */

export type ResultadoApuracao =
  | { ok: true }
  | { ignorada: "fechada" | "vazia" }
  | { erro: string };

interface RespostaRpc {
  ok?: boolean;
  motivo?: string;
  base_locacao_centavos?: number;
  base_coffee_centavos?: number;
}

/** Soma as bases das linhas VIVAS de uma competência, por origem. */
async function lerBases(competencia: string): Promise<BasesCompetencia> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("comissoes")
    .select("origem, base_centavos")
    .eq("competencia", competencia)
    .is("estornada_em", null);

  const bases: BasesCompetencia = { locacaoCentavos: 0, coffeeCentavos: 0 };
  for (const r of (data ?? []) as {
    origem: OrigemComissao;
    base_centavos: number;
  }[]) {
    if (r.origem === "locacao") bases.locacaoCentavos += r.base_centavos ?? 0;
    else bases.coffeeCentavos += r.base_centavos ?? 0;
  }
  return bases;
}

/**
 * Reapura uma competência (idempotente e convergente). No-op quando fechada ou
 * sem linhas — mês vazio não cria cabeçalho, para não gerar 12 linhas de lixo/ano.
 *
 * O CAS (`p_base_*_esperada`) pega a corrida entre a leitura das bases aqui e o
 * lock da RPC: se outra baixa entrou no meio, a RPC devolve as bases reais e a
 * faixa é recomputada. Converge porque o lock serializa as tentativas.
 */
export async function reapurarCompetencia(
  competencia: string,
  opcoes?: { fechar?: boolean; userId?: string | null; cfg?: ConfigComissoes },
): Promise<ResultadoApuracao> {
  const admin = createAdminClient();
  const cfg = opcoes?.cfg ?? (await lerConfigComissoes());
  const configJson = serializarConfigComissoes(cfg);

  let bases = await lerBases(competencia);

  for (let tentativa = 0; tentativa < 3; tentativa++) {
    if (bases.locacaoCentavos === 0 && bases.coffeeCentavos === 0) {
      // Sem linhas vivas: nada a apurar (fechar exige linhas — a RPC recusa).
      if (!opcoes?.fechar) return { ignorada: "vazia" };
    }

    const a = apurarCompetencia(cfg, bases);

    const { data, error } = await admin.rpc("apurar_comissao_competencia", {
      p_competencia: competencia,
      p_pct_locacao: a.percentualLocacao,
      p_pct_coffee: a.percentualCoffee,
      p_bonus_aplicado: a.bonusAplicado,
      p_config: configJson,
      p_base_locacao_esperada: bases.locacaoCentavos,
      p_base_coffee_esperada: bases.coffeeCentavos,
      p_fechar: opcoes?.fechar === true,
      p_user: opcoes?.userId ?? null,
    });

    if (error) {
      console.error(
        `[comissoes] falha ao apurar a competência ${competencia}:`,
        error.message,
      );
      return { erro: "Não foi possível apurar a competência." };
    }

    const r = (data ?? {}) as RespostaRpc;
    if (r.ok === true) return { ok: true };

    if (r.motivo === "fechada") return { ignorada: "fechada" };
    if (r.motivo === "vazia") return { ignorada: "vazia" };
    if (r.motivo === "bases_mudaram") {
      bases = {
        locacaoCentavos: r.base_locacao_centavos ?? 0,
        coffeeCentavos: r.base_coffee_centavos ?? 0,
      };
      continue;
    }

    return { erro: "Não foi possível apurar a competência." };
  }

  return { erro: "A apuração não convergiu — tente novamente." };
}

/** Reapura várias competências (dedup + sequencial). Best-effort. */
export async function reapurarCompetencias(
  competencias: (string | null | undefined)[],
): Promise<void> {
  const unicas = [...new Set(competencias.filter((c): c is string => !!c))];
  if (unicas.length === 0) return;
  const cfg = await lerConfigComissoes();
  for (const c of unicas) {
    try {
      await reapurarCompetencia(c, { cfg });
    } catch (e) {
      console.error(`[comissoes] reapuração falhou em ${c}:`, e);
    }
  }
}

/** Todas as competências ABERTAS com ao menos uma linha viva. */
export async function competenciasAbertasComLinhas(): Promise<string[]> {
  const admin = createAdminClient();
  const [{ data: linhas }, fechadas] = await Promise.all([
    admin.from("comissoes").select("competencia").is("estornada_em", null),
    competenciasFechadas(),
  ]);
  const travadas = new Set(fechadas);
  const todas = new Set(
    ((linhas ?? []) as { competencia: string }[]).map((r) =>
      String(r.competencia).slice(0, 10),
    ),
  );
  return [...todas].filter((c) => !travadas.has(c));
}

function revalidar(): void {
  revalidatePath("/admin/comissoes");
}

/**
 * Fecha a competência: reapura uma última vez, grava o snapshot da config e
 * congela. Depois disso os valores não mudam mais e as comissões podem ser pagas.
 */
export async function fecharCompetencia(input: {
  mes: string;
}): Promise<{ ok: true } | { erro: string }> {
  const { user } = await requireColaborador();
  const competencia = competenciaDoMes(input.mes);

  const admin = createAdminClient();
  const { count } = await admin
    .from("comissoes")
    .select("id", { count: "exact", head: true })
    .eq("competencia", competencia)
    .is("estornada_em", null);

  if (!count || count === 0) {
    return { erro: "Não há comissões nesta competência para fechar." };
  }

  const r = await reapurarCompetencia(competencia, {
    fechar: true,
    userId: user.id,
  });
  if ("erro" in r) return r;
  if ("ignorada" in r) {
    return {
      erro:
        r.ignorada === "fechada"
          ? "Esta competência já está fechada."
          : "Não há comissões nesta competência para fechar.",
    };
  }

  revalidar();
  return { ok: true };
}

/**
 * Reabre a competência (admin). BLOQUEADO se houver comissão já paga: reabrir
 * reapura e reescreveria o valor de algo que já foi quitado ao colaborador. O
 * escape é explícito — desmarcar as pagas e então reabrir.
 */
export async function reabrirCompetencia(input: {
  mes: string;
}): Promise<{ ok: true } | { erro: string }> {
  const { user } = await requireAdmin();
  const competencia = competenciaDoMes(input.mes);
  const admin = createAdminClient();

  const { count: pagas } = await admin
    .from("comissoes")
    .select("id", { count: "exact", head: true })
    .eq("competencia", competencia)
    .is("estornada_em", null)
    .eq("pago", true);

  if (pagas && pagas > 0) {
    return {
      erro: `Há ${pagas} comissão(ões) já paga(s) nesta competência. Desmarque-as como pagas antes de reabrir.`,
    };
  }

  const { data, error } = await admin.rpc("reabrir_comissao_competencia", {
    p_competencia: competencia,
    p_user: user.id,
  });

  if (error) {
    console.error(
      `[comissoes] falha ao reabrir a competência ${competencia}:`,
      error.message,
    );
    return { erro: "Não foi possível reabrir a competência." };
  }

  const r = (data ?? {}) as RespostaRpc;
  if (r.ok !== true) {
    return {
      erro:
        r.motivo === "nao_fechada"
          ? "Esta competência não está fechada."
          : "Não foi possível reabrir a competência.",
    };
  }

  await reapurarCompetencia(competencia);
  revalidar();
  return { ok: true };
}

/** Reapura sob demanda (botão "Recalcular" do painel). */
export async function recalcularCompetencia(input: {
  mes: string;
}): Promise<{ ok: true } | { erro: string }> {
  await requireColaborador();
  const r = await reapurarCompetencia(competenciaDoMes(input.mes));
  if ("erro" in r) return r;
  if ("ignorada" in r && r.ignorada === "fechada") {
    return { erro: "Competência fechada — reabra antes de recalcular." };
  }
  revalidar();
  return { ok: true };
}
