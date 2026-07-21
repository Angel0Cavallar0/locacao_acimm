import "server-only";
import type { PeriodoDia } from "@/lib/dominio";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  avaliarElegibilidadeCombo,
  calcularDescontoMultiSala,
  ratearValorFechado,
} from "./combo-core";

/**
 * Combos aplicáveis no fluxo de locação (Spec 20 §4). Escopo: `desconto_multi_sala`
 * e `evento_privativo` (assinatura adiada). Lido no server (service role — RLS de
 * combos só libera colaborador; o portal também carrega por aqui). Alimenta a aba
 * "Combos" do assistido e do portal.
 */

export interface ComboAplicavel {
  id: string;
  nome: string;
  descricao: string | null;
  tipo: "desconto_multi_sala" | "evento_privativo";
  periodo: PeriodoDia | null;
  tipoDesconto: "percentual" | "valor" | null;
  descontoValor: number | null;
  valorCentavos: number | null; // evento_privativo
  /** Salas que a reserva precisa ter (o form trava a seleção). */
  salaIdsObrigatorias: string[];
  /** Salas que recebem desconto (multi-sala). */
  salaIdsComDesconto: string[];
  /** Coffee break obrigatório do combo (multi-sala), ou null (Spec 26). */
  coffeeNivelId: string | null;
  coffeeNivelNome: string | null;
  /** Combo exige qualquer coffee (sem fixar nível) — Spec 26. */
  coffeeQualquer: boolean;
}

export async function listarCombosAplicaveis(): Promise<ComboAplicavel[]> {
  const admin = createAdminClient();

  const [{ data: combosRows }, { data: salasRows }] = await Promise.all([
    admin
      .from("combos")
      .select(
        "id, nome, descricao, tipo, periodo, tipo_desconto, desconto_valor, valor_centavos, coffee_nivel_id, coffee_qualquer",
      )
      .eq("ativo", true)
      .in("tipo", ["desconto_multi_sala", "evento_privativo"])
      .order("nome", { ascending: true }),
    admin
      .from("salas")
      .select("id")
      .eq("ativa", true)
      .is("excluida_em", null),
  ]);

  const combos = (combosRows ?? []) as {
    id: string;
    nome: string;
    descricao: string | null;
    tipo: "desconto_multi_sala" | "evento_privativo";
    periodo: PeriodoDia | null;
    tipo_desconto: "percentual" | "valor" | null;
    desconto_valor: number | null;
    valor_centavos: number | null;
    coffee_nivel_id: string | null;
    coffee_qualquer: boolean;
  }[];
  if (combos.length === 0) return [];

  const todasAtivas = ((salasRows ?? []) as { id: string }[]).map((s) => s.id);

  // Nomes dos níveis de coffee vinculados (para exibir "Inclui Coffee Break Z").
  const nivelIds = [
    ...new Set(combos.map((c) => c.coffee_nivel_id).filter(Boolean)),
  ] as string[];
  const nomeNivel = new Map<string, string>();
  if (nivelIds.length > 0) {
    const { data: niveisRows } = await admin
      .from("coffee_niveis")
      .select("id, nome")
      .in("id", nivelIds);
    for (const n of (niveisRows ?? []) as { id: string; nome: string }[]) {
      nomeNivel.set(n.id, n.nome);
    }
  }

  const { data: vinculos } = await admin
    .from("combo_salas")
    .select("combo_id, sala_id, aplica_desconto")
    .in(
      "combo_id",
      combos.map((c) => c.id),
    );
  const porCombo = new Map<
    string,
    { sala_id: string; aplica_desconto: boolean }[]
  >();
  for (const v of (vinculos ?? []) as {
    combo_id: string;
    sala_id: string;
    aplica_desconto: boolean;
  }[]) {
    const lista = porCombo.get(v.combo_id) ?? [];
    lista.push({ sala_id: v.sala_id, aplica_desconto: v.aplica_desconto });
    porCombo.set(v.combo_id, lista);
  }

  return combos.map((c) => {
    const salas = porCombo.get(c.id) ?? [];
    return {
      id: c.id,
      nome: c.nome,
      descricao: c.descricao,
      tipo: c.tipo,
      periodo: c.periodo,
      tipoDesconto: c.tipo_desconto,
      descontoValor: c.desconto_valor,
      valorCentavos: c.valor_centavos,
      // evento_privativo = todas as salas ativas; multi-sala = salas do combo.
      salaIdsObrigatorias:
        c.tipo === "evento_privativo" ? todasAtivas : salas.map((s) => s.sala_id),
      salaIdsComDesconto: salas
        .filter((s) => s.aplica_desconto)
        .map((s) => s.sala_id),
      coffeeNivelId: c.coffee_nivel_id,
      coffeeNivelNome: c.coffee_nivel_id
        ? (nomeNivel.get(c.coffee_nivel_id) ?? null)
        : null,
      coffeeQualquer: c.coffee_qualquer === true,
    };
  });
}

export type RevalidacaoCombo =
  | {
      aplicado: true;
      salas: { sala_id: string; valor: number }[];
      valorSalas: number;
      descontosCentavos: number;
    }
  | { aplicado: false };

/**
 * Revalida um combo no reagendamento (Spec 20 §3): elegibilidade fresca para a
 * nova sala/data/período. Se elegível, devolve os valores recomputados (rateio
 * do privativo / desconto do multi-sala); senão `{aplicado:false}` (o chamador
 * recalcula sem combo e avisa). Reusa o núcleo puro `combo-core`.
 */
export async function revalidarComboReagendamento(input: {
  comboId: string;
  condicao: string;
  associadoId: string | null;
  salaIds: string[];
  periodo: string;
  salasComValor: { sala_id: string; valor: number }[];
  /** Coffee da locação (não muda no reagendamento) — Spec 26. */
  coffeeNivelIdSelecionado: string | null;
}): Promise<RevalidacaoCombo> {
  const admin = createAdminClient();
  const [
    { data: comboRow },
    { data: comboSalasRows },
    { data: assoc },
    { data: ativasRows },
  ] = await Promise.all([
    admin
      .from("combos")
      .select(
        "tipo, tipo_desconto, desconto_valor, valor_centavos, periodo, ativo, coffee_nivel_id, coffee_qualquer",
      )
      .eq("id", input.comboId)
      .maybeSingle(),
    admin.from("combo_salas").select("sala_id, aplica_desconto").eq("combo_id", input.comboId),
    input.associadoId
      ? admin.from("associados").select("situacao").eq("id", input.associadoId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("salas").select("id").eq("ativa", true).is("excluida_em", null),
  ]);
  if (!comboRow) return { aplicado: false };

  const tipo = comboRow.tipo as string;
  if (tipo !== "desconto_multi_sala" && tipo !== "evento_privativo") {
    return { aplicado: false };
  }
  const comboSalas = (comboSalasRows ?? []) as {
    sala_id: string;
    aplica_desconto: boolean;
  }[];
  const todasAtivas = ((ativasRows ?? []) as { id: string }[]).map((r) => r.id);

  const aval = avaliarElegibilidadeCombo({
    condicao: input.condicao,
    associadoAtivo: (assoc?.situacao ?? "") === "ativo",
    ativo: comboRow.ativo === true,
    tipo,
    comboSalaIds: comboSalas.map((r) => r.sala_id),
    salasSelecionadas: input.salaIds,
    todasSalasAtivasIds: todasAtivas,
    comboPeriodo: (comboRow.periodo as string | null) ?? null,
    periodo: input.periodo,
    comboCoffeeNivelId: (comboRow.coffee_nivel_id as string | null) ?? null,
    comboCoffeeQualquer: comboRow.coffee_qualquer === true,
    coffeeNivelIdSelecionado: input.coffeeNivelIdSelecionado,
  });
  if (!aval.elegivel) return { aplicado: false };

  if (tipo === "evento_privativo") {
    const total = (comboRow.valor_centavos as number | null) ?? 0;
    const rateio = ratearValorFechado(
      input.salasComValor.map((s) => ({ salaId: s.sala_id, valorCentavos: s.valor })),
      total,
    );
    return {
      aplicado: true,
      salas: rateio.map((r) => ({ sala_id: r.salaId, valor: r.valorCentavos })),
      valorSalas: total,
      descontosCentavos: 0,
    };
  }

  const linhas = calcularDescontoMultiSala(
    input.salasComValor.map((s) => ({ salaId: s.sala_id, valorCentavos: s.valor })),
    comboSalas.filter((r) => r.aplica_desconto).map((r) => r.sala_id),
    (comboRow.tipo_desconto as string) ?? "percentual",
    (comboRow.desconto_valor as number | null) ?? 0,
  );
  const descontosCentavos = linhas.reduce((s, l) => s + l.valorCentavos, 0);
  return {
    aplicado: true,
    salas: input.salasComValor,
    valorSalas: input.salasComValor.reduce((s, x) => s + x.valor, 0),
    descontosCentavos,
  };
}
