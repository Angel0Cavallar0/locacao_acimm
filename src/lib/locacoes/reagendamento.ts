import "server-only";
import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { spWallParaUtc } from "@/lib/calendario/tempo";
import type { CondicaoLocatario, PeriodoDia } from "@/lib/dominio";
import { avaliarBeneficioReagendamento } from "@/lib/periodo-gratuito/consumo";
import { resolverPreco } from "@/lib/precos/resolver";
import { createAdminClient } from "@/lib/supabase/admin";
import { revalidarComboReagendamento } from "./combos-dados";
import { descreverConflitoAgenda } from "./dados";
import { podeReagendar, type StatusLocacao } from "./maquina-estados-core";

export type ResultadoReagendamento = { ok: true; aviso?: string } | { erro: string };

export interface ReagendarInput {
  locacaoId: string;
  data: string; // 'YYYY-MM-DD' (São Paulo)
  horaInicio: string; // 'HH:mm'
  horaFim: string; // 'HH:mm'
  periodo: PeriodoDia;
  salaIds: string[];
}

/**
 * Reagenda uma locação (§2.5): novo horário/período e/ou salas. Recalcula os
 * valores de sala SEMPRE via resolverPreco() (nunca aproveita o valor antigo),
 * revalida conflito de agenda (23P01) e registra antes→depois na auditoria.
 * Proibido a partir de contrato_enviado.
 */
export async function reagendarLocacao(
  input: ReagendarInput,
): Promise<ResultadoReagendamento> {
  const { user } = await requireColaborador();
  const admin = createAdminClient();

  if (input.salaIds.length === 0) {
    return { erro: "Selecione ao menos uma sala." };
  }

  const { data: loc } = await admin
    .from("locacoes")
    .select(
      `id, status, condicao, associado_id, combo_id, inicio, fim, periodo,
       valor_coffee_centavos, valor_adicionais_centavos, valor_descontos_centavos`,
    )
    .eq("id", input.locacaoId)
    .maybeSingle();
  if (!loc) return { erro: "Locação não encontrada." };

  const status = loc.status as StatusLocacao;
  if (!podeReagendar(status)) {
    return {
      erro: "Reagendamento indisponível a partir do envio do contrato. Cancele e recrie a locação.",
    };
  }

  const inicioUtc = spWallParaUtc(input.data, input.horaInicio);
  const fimUtc = spWallParaUtc(input.data, input.horaFim);
  if (Date.parse(fimUtc) <= Date.parse(inicioUtc)) {
    return { erro: "O horário de fim deve ser maior que o de início." };
  }

  const condicao = loc.condicao as CondicaoLocatario;
  const dataEvento = new Date(inicioUtc);

  // Nomes das salas (para mensagens de erro claras).
  const { data: salasInfo } = await admin
    .from("salas")
    .select("id, nome")
    .in("id", input.salaIds);
  const nomeSala = new Map(
    (salasInfo ?? []).map((s) => [s.id as string, s.nome as string]),
  );

  // Recalcula o preço de cada sala para a nova data/período.
  const salasComValor: { sala_id: string; valor: number }[] = [];
  let valorSalas = 0;
  for (const salaId of input.salaIds) {
    const preco = await resolverPreco({
      salaId,
      data: dataEvento,
      periodo: input.periodo,
      condicao,
    });
    if ("erro" in preco) {
      return {
        erro: `Sem preço vigente para ${nomeSala.get(salaId) ?? "a sala"} no período selecionado nessa data.`,
      };
    }
    salasComValor.push({ sala_id: salaId, valor: preco.valorCentavos });
    valorSalas += preco.valorCentavos;
  }

  // Revalida o combo (Spec 20 §3): pode mudar salas/valores; se não couber, cai.
  let comboIdFinal: string | null = null;
  let comboAviso: string | undefined;
  let salasParaRpc = salasComValor;
  let valorSalasFinal = valorSalas;
  let descontosCombo = 0;
  if (loc.combo_id) {
    const rc = await revalidarComboReagendamento({
      comboId: loc.combo_id as string,
      condicao,
      associadoId: (loc.associado_id as string | null) ?? null,
      salaIds: input.salaIds,
      periodo: input.periodo,
      salasComValor,
    });
    if (rc.aplicado) {
      comboIdFinal = loc.combo_id as string;
      salasParaRpc = rc.salas;
      valorSalasFinal = rc.valorSalas;
      descontosCombo = rc.descontosCentavos;
    } else {
      comboAviso =
        "O combo não é mais válido para esta data/sala/período — o valor foi recalculado sem ele.";
    }
  }

  // Período gratuito só quando NÃO há combo (são exclusivos — Spec 20 §3).
  const beneficio =
    !loc.combo_id && input.salaIds.length === 1
      ? await avaliarBeneficioReagendamento({
          associadoId: (loc.associado_id as string | null) ?? null,
          condicao,
          salaIds: input.salaIds,
          periodo: input.periodo,
          dataISO: input.data,
          excluirLocacaoId: input.locacaoId,
          salaValorCentavos: salasComValor[0]?.valor ?? 0,
        })
      : null;
  const descontos = descontosCombo + (beneficio ? beneficio.descontoCentavos : 0);

  const valorTotal =
    valorSalasFinal +
    (loc.valor_coffee_centavos as number) +
    (loc.valor_adicionais_centavos as number) -
    descontos;

  const dados = {
    antes: {
      inicio: loc.inicio,
      fim: loc.fim,
      periodo: loc.periodo,
    },
    depois: {
      inicio: inicioUtc,
      fim: fimUtc,
      periodo: input.periodo,
      salas: input.salaIds,
      valor_salas_centavos: valorSalasFinal,
      valor_total_centavos: valorTotal,
    },
  };

  const gratuitoPayload = beneficio
    ? {
        sala_id: beneficio.salaId,
        ciclo: beneficio.ciclo,
        horas: (Date.parse(fimUtc) - Date.parse(inicioUtc)) / 3_600_000,
      }
    : null;

  const { data, error } = await admin.rpc("reagendar_locacao", {
    p_locacao_id: input.locacaoId,
    p_de: status,
    p_inicio: inicioUtc,
    p_fim: fimUtc,
    p_periodo: input.periodo,
    p_salas: salasParaRpc,
    p_valor_salas: valorSalasFinal,
    p_valor_total: valorTotal,
    p_autor: user.id,
    p_dados: dados,
    p_valor_descontos: descontos,
    p_periodo_gratuito_aplicado: Boolean(beneficio),
    p_periodo_gratuito: gratuitoPayload,
    p_associado_id: (loc.associado_id as string | null) ?? null,
  });

  if (error) {
    if (error.code === "23P01") {
      return {
        erro: await descreverConflitoAgenda(input.locacaoId, inicioUtc, fimUtc),
      };
    }
    return { erro: "Não foi possível reagendar." };
  }
  if (data === "conflito") {
    return {
      erro: "O estado da locação mudou. Recarregue a página e tente de novo.",
    };
  }

  // Combo revalidado (Spec 20 §3): mantém o vínculo ou o zera se caiu do desenho.
  if (loc.combo_id) {
    await admin
      .from("locacoes")
      .update({ combo_id: comboIdFinal })
      .eq("id", input.locacaoId);
  }

  // Reagendou → espelho no Google precisa atualizar data/horário/salas (Spec 18).
  const { marcarLocacaoPendente } = await import("@/lib/google/marcar");
  await marcarLocacaoPendente(input.locacaoId);

  revalidatePath("/admin/locacoes");
  revalidatePath(`/admin/locacoes/${input.locacaoId}`);
  revalidatePath("/admin/calendario");
  return { ok: true, aviso: comboAviso };
}
