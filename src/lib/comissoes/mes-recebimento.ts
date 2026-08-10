import "server-only";
import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { mesRecebimentoSchema } from "@/lib/validacoes/comissoes";
import { reapurarCompetencias } from "./apuracao";
import {
  competenciaDoMes,
  mesDaCompetencia,
  proximaCompetenciaAberta,
} from "./comissoes-core";
import { competenciasFechadas } from "./dados";

/**
 * Mês do recebimento da locação (Spec 33 §8). Sugerido automaticamente na geração
 * da comissão (mês de max(baixa_em)) e editável pela equipe — o valor informado
 * MANDA na competência da comissão (decisão D).
 *
 * Mover a competência de uma comissão viva reapura os DOIS meses: tirar base de
 * um mês pode derrubá-lo de faixa, e somar no outro pode subi-lo.
 */

function mesBR(competencia: string): string {
  const c = String(competencia).slice(0, 10);
  return `${c.slice(5, 7)}/${c.slice(0, 4)}`;
}

export type ResultadoMesRecebimento =
  | { ok: true; aviso?: string }
  | { erro: string };

export async function salvarMesRecebimento(
  input: unknown,
): Promise<ResultadoMesRecebimento> {
  await requireColaborador();
  const parsed = mesRecebimentoSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { locacaoId, mes } = parsed.data;
  const admin = createAdminClient();
  const destinoDesejado = mes ? competenciaDoMes(mes) : null;

  const { data: vivasRaw } = await admin
    .from("comissoes")
    .select("id, competencia, pago")
    .eq("locacao_id", locacaoId)
    .is("estornada_em", null);

  const vivas = (vivasRaw ?? []) as {
    id: string;
    competencia: string;
    pago: boolean;
  }[];

  // Sem comissão viva: o campo é só um registro (a geração vai respeitá-lo).
  if (vivas.length === 0) {
    const { error } = await admin
      .from("locacoes")
      .update({ mes_recebimento: destinoDesejado })
      .eq("id", locacaoId);
    if (error) return { erro: "Não foi possível salvar o mês de recebimento." };
    revalidatePath(`/admin/locacoes/${locacaoId}`);
    revalidatePath("/admin/comissoes");
    return { ok: true };
  }

  if (!destinoDesejado) {
    return {
      erro:
        "Esta locação já tem comissão gerada — a competência não pode ficar indefinida.",
    };
  }

  if (vivas.some((c) => c.pago)) {
    return {
      erro:
        "Comissão já paga ao colaborador. Desmarque-a como paga antes de mudar o mês.",
    };
  }

  const fechadas = await competenciasFechadas();
  const travadas = new Set(fechadas);

  // Tirar linha de um mês congelado invalidaria o total que embasou o pagamento.
  const origensFechadas = [
    ...new Set(
      vivas
        .map((c) => String(c.competencia).slice(0, 10))
        .filter((c) => travadas.has(c)),
    ),
  ];
  if (origensFechadas.length > 0) {
    return {
      erro: `A competência ${origensFechadas.map(mesBR).join(", ")} está fechada. Reabra-a antes de mover esta comissão.`,
    };
  }

  const destino = proximaCompetenciaAberta(destinoDesejado, fechadas);
  const deslocada = destino !== destinoDesejado;

  const origens = [
    ...new Set(vivas.map((c) => String(c.competencia).slice(0, 10))),
  ];

  const { error: errComissoes } = await admin
    .from("comissoes")
    .update({
      competencia: destino,
      competencia_original: deslocada ? destinoDesejado : null,
    })
    .eq("locacao_id", locacaoId)
    .is("estornada_em", null);
  if (errComissoes) {
    return { erro: "Não foi possível mover a competência das comissões." };
  }

  const { error: errLoc } = await admin
    .from("locacoes")
    .update({ mes_recebimento: destinoDesejado })
    .eq("id", locacaoId);
  if (errLoc) return { erro: "Não foi possível salvar o mês de recebimento." };

  await reapurarCompetencias([...origens, destino]);

  revalidatePath(`/admin/locacoes/${locacaoId}`);
  revalidatePath("/admin/comissoes");

  return {
    ok: true,
    aviso: deslocada
      ? `A competência ${mesBR(destinoDesejado)} está fechada — a comissão foi lançada em ${mesBR(destino)}.`
      : undefined,
  };
}

/** Mês 'YYYY-MM' gravado na locação (para o formulário do detalhe). */
export function mesDoCampo(valor: string | null): string | null {
  return valor ? mesDaCompetencia(String(valor).slice(0, 10)) : null;
}
