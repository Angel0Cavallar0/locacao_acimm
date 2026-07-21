import "server-only";
import { spWallParaUtc } from "@/lib/calendario/tempo";
import { parsearFaixas, valorPessoaDe } from "@/lib/coffee/faixas-core";
import type { CondicaoLocatario, PeriodoDia } from "@/lib/dominio";
import {
  avaliarPeriodoGratuito,
  cicloDeData,
  type MotivoInelegivel,
} from "@/lib/periodo-gratuito/elegibilidade-core";
import { resolverPreco } from "@/lib/precos/resolver";
import { createAdminClient } from "@/lib/supabase/admin";
import { somarAdicionais, totalCoffee, totalGeral } from "./calcular-core";
import {
  avaliarElegibilidadeCombo,
  calcularDescontoMultiSala,
  type MotivoComboInelegivel,
  ratearValorFechado,
} from "./combo-core";

type SalaCalc = { salaId: string; valorCentavos: number; semPreco: boolean };

/**
 * ÚNICA fonte de cálculo de valores da locação (Spec 07 §4). O client nunca
 * calcula preço: o valor da sala vem de resolverPreco() e o valor por pessoa
 * do coffee de coffee_niveis. Os adicionais (locação e coffee) são valores
 * manuais digitados pelo colaborador (como "hora extra R$45"), então entram
 * como informados — a aritmética é sempre refeita aqui. Spec 11 reutiliza.
 */

export interface EntradaCalculo {
  salaIds: string[];
  /** Data do evento 'YYYY-MM-DD' (São Paulo). */
  data: string;
  periodo: PeriodoDia;
  condicao: CondicaoLocatario;
  coffee: {
    nivelId: string;
    qtdPessoas: number;
    adicionaisCentavos: number;
  } | null;
  adicionais: { quantidade: number; valorUnitarioCentavos: number }[];
  /** Sócio: habilita a checagem do período gratuito (Spec 20 §5). */
  associadoId?: string | null;
  /** Sócio recusou o benefício nesta reserva (guarda o uso p/ outra data). */
  periodoGratuitoRecusado?: boolean;
  /** Combo selecionado (Spec 20 §3, parte 2) — exclusivo de sócio ativo. */
  comboId?: string | null;
}

/** Info do combo para a UX e a validação (null = nenhum combo). */
export interface ComboInfo {
  id: string;
  nome: string;
  tipo: string; // 'desconto_multi_sala' | 'evento_privativo' | ...
  elegivel: boolean;
  aplicado: boolean;
  motivo?: MotivoComboInelegivel;
  /** Salas que a reserva precisa ter (o form trava a seleção). */
  salaIdsObrigatorias: string[];
  periodo: string | null;
  /** evento_privativo: soma do resolverPreco (referência p/ mostrar a economia). */
  referenciaCentavos?: number;
  /** Coffee break obrigatório do combo (multi-sala), ou null (Spec 26). */
  coffeeNivelId?: string | null;
  /** Combo exige qualquer coffee break (Spec 26). */
  coffeeQualquer?: boolean;
}

/** Info do período gratuito para a UX e o submit (null = nada a exibir). */
export interface PeriodoGratuitoInfo {
  salaId: string;
  salaNome: string;
  /** Ciclo (mês do evento) 'YYYY-MM-01'. */
  ciclo: string;
  elegivel: boolean;
  aplicado: boolean;
  usoAtual: number;
  limite: number;
  motivo?: MotivoInelegivel;
}

export interface LinhaDesconto {
  rotulo: string;
  valorCentavos: number;
}

export interface ResultadoCalculo {
  salas: { salaId: string; valorCentavos: number; semPreco: boolean }[];
  salasSemPreco: string[];
  salasCentavos: number;
  coffeeCentavos: number;
  adicionaisCentavos: number;
  descontosCentavos: number;
  /** Descontos discriminados (combo multi-sala + período gratuito). */
  descontos: LinhaDesconto[];
  periodoGratuito: PeriodoGratuitoInfo | null;
  combo: ComboInfo | null;
  totalCentavos: number;
}

export async function calcularValores(
  input: EntradaCalculo,
): Promise<ResultadoCalculo> {
  // Meio-dia SP: garante data e dia-da-semana corretos independentemente da hora.
  const dataEvento = new Date(spWallParaUtc(input.data, "12:00"));

  const salasRef: SalaCalc[] = [];
  let salasCentavosRef = 0;
  for (const salaId of input.salaIds) {
    const preco = await resolverPreco({
      salaId,
      data: dataEvento,
      periodo: input.periodo,
      condicao: input.condicao,
    });
    if ("erro" in preco) {
      salasRef.push({ salaId, valorCentavos: 0, semPreco: true });
    } else {
      salasRef.push({ salaId, valorCentavos: preco.valorCentavos, semPreco: false });
      salasCentavosRef += preco.valorCentavos;
    }
  }

  // Combo (Spec 20 §3): pode substituir o valor das salas (privativo) ou gerar
  // descontos discriminados (multi-sala). Só sócio ativo; recalculado no servidor.
  const descontos: LinhaDesconto[] = [];
  const rc = input.comboId
    ? await avaliarCombo(input, salasRef, salasCentavosRef)
    : null;
  const combo = rc?.info ?? null;
  const comboAplicado = rc?.aplicado === true;

  const salas = comboAplicado ? rc.salas : salasRef;
  const salasCentavos = comboAplicado ? rc.salasCentavos : salasCentavosRef;
  const salasSemPreco = comboAplicado
    ? rc.salasSemPreco
    : salasRef.filter((s) => s.semPreco).map((s) => s.salaId);
  if (comboAplicado) descontos.push(...rc.descontos);

  let coffeeCentavos = 0;
  if (input.coffee) {
    const admin = createAdminClient();
    const { data: nivel } = await admin
      .from("coffee_niveis")
      .select("faixas_preco")
      .eq("id", input.coffee.nivelId)
      .maybeSingle();
    const valorPessoa = valorPessoaDe(
      parsearFaixas(nivel?.faixas_preco),
      input.coffee.qtdPessoas,
    );
    coffeeCentavos = totalCoffee(
      valorPessoa,
      input.coffee.qtdPessoas,
      input.coffee.adicionaisCentavos,
    );
  }

  const adicionaisCentavos = somarAdicionais(input.adicionais);

  // Período gratuito do sócio (Spec 20 §5): sala única, sócio ativo, regra ativa.
  // Não combina com combo (gate temCombo).
  const periodoGratuito = await avaliarGratuito(input, salas, comboAplicado);
  if (periodoGratuito?.aplicado) {
    const sala = salas.find((s) => s.salaId === periodoGratuito.salaId);
    descontos.push({
      rotulo: `Período gratuito do associado — ${periodoGratuito.salaNome}`,
      valorCentavos: sala?.valorCentavos ?? 0,
    });
  }
  const descontosCentavos = descontos.reduce((s, d) => s + d.valorCentavos, 0);

  const totalCentavos = totalGeral({
    salasCentavos,
    coffeeCentavos,
    adicionaisCentavos,
    descontosCentavos,
  });

  return {
    salas,
    salasSemPreco,
    salasCentavos,
    coffeeCentavos,
    adicionaisCentavos,
    descontosCentavos,
    descontos,
    periodoGratuito,
    combo,
    totalCentavos,
  };
}

interface ResultadoAvaliacaoCombo {
  info: ComboInfo;
  aplicado: boolean;
  salas: SalaCalc[];
  salasCentavos: number;
  salasSemPreco: string[];
  descontos: LinhaDesconto[];
}

/**
 * Avalia e aplica o combo (Spec 20 §3). Só `desconto_multi_sala` e
 * `evento_privativo` (assinatura adiada). Elegibilidade e valores são
 * recalculados a partir da definição do combo + resolverPreco — o client não
 * injeta desconto. `aplicado=false` mantém os valores de referência (a action
 * rejeita se o payload trouxe um comboId inelegível).
 */
async function avaliarCombo(
  input: EntradaCalculo,
  salasRef: SalaCalc[],
  salasCentavosRef: number,
): Promise<ResultadoAvaliacaoCombo | null> {
  const admin = createAdminClient();
  const comboId = input.comboId as string;

  const [
    { data: comboRow },
    { data: comboSalasRows },
    { data: assoc },
    { data: ativasRows },
    { data: nomesRows },
  ] = await Promise.all([
    admin
      .from("combos")
      .select(
        "id, nome, tipo, tipo_desconto, desconto_valor, valor_centavos, periodo, ativo, coffee_nivel_id, coffee_qualquer",
      )
      .eq("id", comboId)
      .maybeSingle(),
    admin.from("combo_salas").select("sala_id, aplica_desconto").eq("combo_id", comboId),
    input.associadoId
      ? admin.from("associados").select("situacao").eq("id", input.associadoId).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("salas").select("id").eq("ativa", true).is("excluida_em", null),
    admin.from("salas").select("id, nome").in("id", input.salaIds),
  ]);

  if (!comboRow) return null;

  const tipo = comboRow.tipo as string;
  const comboSalas = (comboSalasRows ?? []) as {
    sala_id: string;
    aplica_desconto: boolean;
  }[];
  const comboSalaIds = comboSalas.map((r) => r.sala_id);
  const salaIdsComDesconto = comboSalas
    .filter((r) => r.aplica_desconto)
    .map((r) => r.sala_id);
  const todasAtivas = ((ativasRows ?? []) as { id: string }[]).map((r) => r.id);
  const salaIdsObrigatorias =
    tipo === "evento_privativo" ? todasAtivas : comboSalaIds;
  const nomeSala = new Map(
    ((nomesRows ?? []) as { id: string; nome: string }[]).map((s) => [s.id, s.nome]),
  );

  const semPrecoRef = salasRef.filter((s) => s.semPreco).map((s) => s.salaId);
  const comboCoffeeNivelId =
    (comboRow.coffee_nivel_id as string | null) ?? null;
  const infoBase: ComboInfo = {
    id: comboRow.id as string,
    nome: comboRow.nome as string,
    tipo,
    elegivel: false,
    aplicado: false,
    salaIdsObrigatorias,
    periodo: (comboRow.periodo as string | null) ?? null,
    coffeeNivelId: comboCoffeeNivelId,
    coffeeQualquer: comboRow.coffee_qualquer === true,
  };

  // Assinatura mensal (ou tipo desconhecido) não é aplicável nesta fase.
  if (tipo !== "desconto_multi_sala" && tipo !== "evento_privativo") {
    return {
      info: infoBase,
      aplicado: false,
      salas: salasRef,
      salasCentavos: salasCentavosRef,
      salasSemPreco: semPrecoRef,
      descontos: [],
    };
  }

  const aval = avaliarElegibilidadeCombo({
    condicao: input.condicao,
    associadoAtivo: (assoc?.situacao ?? "") === "ativo",
    ativo: comboRow.ativo === true,
    tipo,
    comboSalaIds,
    salasSelecionadas: input.salaIds,
    todasSalasAtivasIds: todasAtivas,
    comboPeriodo: (comboRow.periodo as string | null) ?? null,
    periodo: input.periodo,
    comboCoffeeNivelId,
    comboCoffeeQualquer: comboRow.coffee_qualquer === true,
    coffeeNivelIdSelecionado: input.coffee?.nivelId ?? null,
  });

  const info: ComboInfo = {
    ...infoBase,
    elegivel: aval.elegivel,
    aplicado: aval.elegivel,
    motivo: aval.motivo,
  };

  if (!aval.elegivel) {
    return {
      info,
      aplicado: false,
      salas: salasRef,
      salasCentavos: salasCentavosRef,
      salasSemPreco: semPrecoRef,
      descontos: [],
    };
  }

  if (tipo === "evento_privativo") {
    const total = (comboRow.valor_centavos as number | null) ?? 0;
    const rateio = ratearValorFechado(
      salasRef.map((s) => ({ salaId: s.salaId, valorCentavos: s.valorCentavos })),
      total,
    );
    const salas: SalaCalc[] = rateio.map((r) => ({
      salaId: r.salaId,
      valorCentavos: r.valorCentavos,
      semPreco: false,
    }));
    return {
      info: { ...info, referenciaCentavos: salasCentavosRef },
      aplicado: true,
      salas,
      salasCentavos: total,
      salasSemPreco: [], // valor fechado governa; sala sem tabela não barra
      descontos: [],
    };
  }

  // desconto_multi_sala
  const linhas = calcularDescontoMultiSala(
    salasRef.map((s) => ({ salaId: s.salaId, valorCentavos: s.valorCentavos })),
    salaIdsComDesconto,
    (comboRow.tipo_desconto as string) ?? "percentual",
    (comboRow.desconto_valor as number | null) ?? 0,
  );
  const descontos: LinhaDesconto[] = linhas.map((l) => ({
    rotulo: `Combo ${comboRow.nome} — desconto em ${nomeSala.get(l.salaId) ?? "sala"}`,
    valorCentavos: l.valorCentavos,
  }));

  return {
    info,
    aplicado: true,
    salas: salasRef,
    salasCentavos: salasCentavosRef,
    salasSemPreco: semPrecoRef,
    descontos,
  };
}

/**
 * Avalia o período gratuito para a reserva. Só produz info quando há uma regra
 * ativa para a sala única de um sócio (senão null — nada aparece na UX §5.4). O
 * `aplicado` respeita o toggle de recusa e exige a sala com preço (há o que zerar).
 */
async function avaliarGratuito(
  input: EntradaCalculo,
  salas: SalaCalc[],
  temCombo: boolean,
): Promise<PeriodoGratuitoInfo | null> {
  if (
    !input.associadoId ||
    input.condicao !== "associado" ||
    input.salaIds.length !== 1 ||
    temCombo
  ) {
    return null;
  }
  const salaId = input.salaIds[0];
  const admin = createAdminClient();

  const [{ data: regraRow }, { data: assoc }, { data: sala }] = await Promise.all([
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
    admin.from("salas").select("nome").eq("id", salaId).maybeSingle(),
  ]);

  // Sem regra ativa para a sala → nada a exibir.
  if (!regraRow || regraRow.ativo !== true) return null;

  const ciclo = cicloDeData(input.data);
  const { count } = await admin
    .from("periodos_gratuitos")
    .select("id", { count: "exact", head: true })
    .eq("associado_id", input.associadoId)
    .eq("sala_id", salaId)
    .eq("ciclo", ciclo);

  const aval = avaliarPeriodoGratuito({
    condicao: input.condicao,
    associadoAtivo: (assoc?.situacao ?? "") === "ativo",
    salaCount: 1,
    temCombo: Boolean(input.comboId),
    periodo: input.periodo,
    regra: {
      periodos: (regraRow.periodos ?? []) as string[],
      usosPorCiclo: regraRow.usos_por_ciclo as number,
      ativo: regraRow.ativo as boolean,
    },
    usoAtual: count ?? 0,
  });

  const salaSemPreco = salas.find((s) => s.salaId === salaId)?.semPreco ?? true;
  const aplicado =
    aval.elegivel && !input.periodoGratuitoRecusado && !salaSemPreco;

  return {
    salaId,
    salaNome: (sala?.nome as string) ?? "sala",
    ciclo,
    elegivel: aval.elegivel,
    aplicado,
    usoAtual: aval.usoAtual,
    limite: aval.limite,
    motivo: aval.motivo,
  };
}
