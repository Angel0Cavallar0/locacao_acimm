import "server-only";
import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { spWallParaUtc } from "@/lib/calendario/tempo";
import type { CondicaoLocatario, PeriodoDia } from "@/lib/dominio";
import { resolverPreco } from "@/lib/precos/resolver";
import { createAdminClient } from "@/lib/supabase/admin";
import { descreverConflitoAgenda } from "./dados";
import { podeReagendar, type StatusLocacao } from "./maquina-estados-core";

export type ResultadoReagendamento = { ok: true } | { erro: string };

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
      `id, status, condicao, inicio, fim, periodo,
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

  const valorTotal =
    valorSalas +
    (loc.valor_coffee_centavos as number) +
    (loc.valor_adicionais_centavos as number) -
    (loc.valor_descontos_centavos as number);

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
      valor_salas_centavos: valorSalas,
      valor_total_centavos: valorTotal,
    },
  };

  const { data, error } = await admin.rpc("reagendar_locacao", {
    p_locacao_id: input.locacaoId,
    p_de: status,
    p_inicio: inicioUtc,
    p_fim: fimUtc,
    p_periodo: input.periodo,
    p_salas: salasComValor,
    p_valor_salas: valorSalas,
    p_valor_total: valorTotal,
    p_autor: user.id,
    p_dados: dados,
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

  revalidatePath("/admin/locacoes");
  revalidatePath(`/admin/locacoes/${input.locacaoId}`);
  revalidatePath("/admin/calendario");
  return { ok: true };
}
