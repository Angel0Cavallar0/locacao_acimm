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
  /** Descontos discriminados (período gratuito; combos no PR seguinte). */
  descontos: LinhaDesconto[];
  periodoGratuito: PeriodoGratuitoInfo | null;
  totalCentavos: number;
}

export async function calcularValores(
  input: EntradaCalculo,
): Promise<ResultadoCalculo> {
  // Meio-dia SP: garante data e dia-da-semana corretos independentemente da hora.
  const dataEvento = new Date(spWallParaUtc(input.data, "12:00"));

  const salas: { salaId: string; valorCentavos: number; semPreco: boolean }[] =
    [];
  let salasCentavos = 0;
  for (const salaId of input.salaIds) {
    const preco = await resolverPreco({
      salaId,
      data: dataEvento,
      periodo: input.periodo,
      condicao: input.condicao,
    });
    if ("erro" in preco) {
      salas.push({ salaId, valorCentavos: 0, semPreco: true });
    } else {
      salas.push({ salaId, valorCentavos: preco.valorCentavos, semPreco: false });
      salasCentavos += preco.valorCentavos;
    }
  }
  const salasSemPreco = salas.filter((s) => s.semPreco).map((s) => s.salaId);

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
  const descontos: LinhaDesconto[] = [];
  const periodoGratuito = await avaliarGratuito(input, salas);
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
    totalCentavos,
  };
}

/**
 * Avalia o período gratuito para a reserva. Só produz info quando há uma regra
 * ativa para a sala única de um sócio (senão null — nada aparece na UX §5.4). O
 * `aplicado` respeita o toggle de recusa e exige a sala com preço (há o que zerar).
 */
async function avaliarGratuito(
  input: EntradaCalculo,
  salas: { salaId: string; valorCentavos: number; semPreco: boolean }[],
): Promise<PeriodoGratuitoInfo | null> {
  if (
    !input.associadoId ||
    input.condicao !== "associado" ||
    input.salaIds.length !== 1
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
    temCombo: false,
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
