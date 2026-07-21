import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { avaliarPeriodoGratuito, cicloDeData } from "./elegibilidade-core";

/**
 * Saldo e devolução do período gratuito (Spec 20 §5.3/§5.4). O consumo é gravado
 * pela RPC de criação (mesma transação); aqui lemos o saldo (perfil/selo) e
 * devolvemos o uso quando a locação é recusada/cancelada.
 */

export interface SaldoSala {
  salaId: string;
  salaNome: string;
  limite: number;
  usados: number;
  disponiveis: number;
}

/**
 * Saldo por sala (das salas com regra ativa) para um associado no ciclo do mês
 * informado (padrão: mês atual em SP). Base do card do perfil e do selo na
 * disponibilidade.
 */
export async function saldoDoAssociado(
  associadoId: string,
  cicloISO?: string,
): Promise<SaldoSala[]> {
  const admin = createAdminClient();
  const hoje =
    cicloISO ??
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
      new Date(),
    );
  const ciclo = cicloDeData(hoje);

  const { data: regras } = await admin
    .from("regras_periodo_gratuito")
    .select("sala_id, usos_por_ciclo, salas ( nome )")
    .eq("ativo", true);

  const linhas = (regras ?? []) as {
    sala_id: string;
    usos_por_ciclo: number;
    salas: { nome: string } | { nome: string }[] | null;
  }[];
  if (linhas.length === 0) return [];

  const { data: usos } = await admin
    .from("periodos_gratuitos")
    .select("sala_id")
    .eq("associado_id", associadoId)
    .eq("ciclo", ciclo);

  const contagem = new Map<string, number>();
  for (const u of (usos ?? []) as { sala_id: string | null }[]) {
    if (u.sala_id) contagem.set(u.sala_id, (contagem.get(u.sala_id) ?? 0) + 1);
  }

  return linhas
    .map((r) => {
      const nomeRaw = r.salas;
      const salaNome = Array.isArray(nomeRaw)
        ? (nomeRaw[0]?.nome ?? "—")
        : (nomeRaw?.nome ?? "—");
      const usados = contagem.get(r.sala_id) ?? 0;
      return {
        salaId: r.sala_id,
        salaNome,
        limite: r.usos_por_ciclo,
        usados,
        disponiveis: Math.max(0, r.usos_por_ciclo - usados),
      };
    })
    .sort((a, b) => a.salaNome.localeCompare(b.salaNome));
}

/** Conjunto de salas com benefício disponível (selo na disponibilidade §5.4). */
export async function salasComGratuitoDisponivel(
  associadoId: string,
  cicloISO?: string,
): Promise<Set<string>> {
  const saldo = await saldoDoAssociado(associadoId, cicloISO);
  return new Set(saldo.filter((s) => s.disponiveis > 0).map((s) => s.salaId));
}

/** Devolve o uso do benefício (recusada/cancelada). Idempotente. */
export async function devolverPeriodoGratuito(locacaoId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from("periodos_gratuitos").delete().eq("locacao_id", locacaoId);
}

/**
 * Revalida o benefício no reagendamento (§5.3): elegibilidade fresca para a
 * nova sala/data/período, EXCLUINDO o consumo da própria locação (que será
 * devolvido/reinserido na transação). Retorna null se não se aplica.
 */
export async function avaliarBeneficioReagendamento(input: {
  associadoId: string | null;
  condicao: string;
  salaIds: string[];
  periodo: string;
  dataISO: string;
  excluirLocacaoId: string;
  salaValorCentavos: number;
}): Promise<{ salaId: string; ciclo: string; descontoCentavos: number } | null> {
  if (
    input.condicao !== "associado" ||
    !input.associadoId ||
    input.salaIds.length !== 1 ||
    input.salaValorCentavos <= 0
  ) {
    return null;
  }
  const salaId = input.salaIds[0];
  const admin = createAdminClient();

  const [{ data: regra }, { data: assoc }] = await Promise.all([
    admin
      .from("regras_periodo_gratuito")
      .select("periodos, usos_por_ciclo, ativo")
      .eq("sala_id", salaId)
      .maybeSingle(),
    admin
      .from("associados")
      .select("situacao")
      .eq("id", input.associadoId)
      .maybeSingle(),
  ]);
  if (!regra || regra.ativo !== true) return null;

  const ciclo = cicloDeData(input.dataISO);
  const { count } = await admin
    .from("periodos_gratuitos")
    .select("id", { count: "exact", head: true })
    .eq("associado_id", input.associadoId)
    .eq("sala_id", salaId)
    .eq("ciclo", ciclo)
    .neq("locacao_id", input.excluirLocacaoId);

  const aval = avaliarPeriodoGratuito({
    condicao: "associado",
    associadoAtivo: (assoc?.situacao ?? "") === "ativo",
    salaCount: 1,
    temCombo: false,
    periodo: input.periodo,
    regra: {
      periodos: (regra.periodos ?? []) as string[],
      usosPorCiclo: regra.usos_por_ciclo as number,
      ativo: regra.ativo as boolean,
    },
    usoAtual: count ?? 0,
  });
  if (!aval.elegivel) return null;
  return { salaId, ciclo, descontoCentavos: input.salaValorCentavos };
}
