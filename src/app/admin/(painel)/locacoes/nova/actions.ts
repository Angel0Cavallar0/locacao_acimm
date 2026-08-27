"use server";

import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { spWallParaUtc, utcParaNaiveSP } from "@/lib/calendario/tempo";
import { obterAntecedenciaCoffee } from "@/lib/coffee/config";
import { respeitaAntecedencia } from "@/lib/disponibilidade/janela";
import { validarRespostasFormulario } from "@/lib/formulario/validacao";
import { calcularValores } from "@/lib/locacoes/calcular";
import {
  aplicarTransicao,
  transicionarLocacao,
} from "@/lib/locacoes/maquina-estados";
import type { StatusLocacao } from "@/lib/locacoes/maquina-estados-core";
import type { FormaPagamento } from "@/lib/locacoes/tipos";
import { resolverAdicionais } from "@/lib/servicos-adicionais/resolver";
import { createAdminClient } from "@/lib/supabase/admin";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { criarLocacaoSchema } from "@/lib/validacoes/locacao-assistida";
import type {
  AssociadoBusca,
  ConflitoSobreposicao,
  CriarLocacaoPayload,
  DisponibilidadeSala,
  ResumoValores,
} from "./tipos";

interface AgendaItem {
  sala_id: string;
  inicio: string;
  origem: "locacao" | "evento_interno" | "bloqueio";
  bloqueante: boolean;
  locacao_numero: number | null;
  locatario: string | null;
  evento_titulo: string | null;
  motivo: string | null;
}

function loc(numero: number | null): string {
  return `LOC-${String(numero ?? 0).padStart(6, "0")}`;
}

/**
 * Aviso de antecedência mínima (§A) — no atendimento assistido o colaborador
 * pode furar a regra; aqui só montamos o texto informativo (não bloqueia).
 * `null` quando a data respeita todos os prazos.
 */
async function montarAvisoAntecedencia(
  salas: { nome: string; dias_antecedencia_minima: number | null }[],
  data: string,
  temCoffee: boolean,
): Promise<string | null> {
  const avisos: string[] = [];
  const salaFora = salas.find(
    (s) => !respeitaAntecedencia(data, s.dias_antecedencia_minima ?? 0),
  );
  if (salaFora) {
    avisos.push(
      `a sala ${salaFora.nome} costuma exigir ${salaFora.dias_antecedencia_minima ?? 0} dia(s) de antecedência`,
    );
  }
  if (temCoffee) {
    const { dias } = await obterAntecedenciaCoffee();
    if (!respeitaAntecedencia(data, dias)) {
      avisos.push(`o coffee break costuma exigir ${dias} dia(s) de antecedência`);
    }
  }
  if (avisos.length === 0) return null;
  return `Atenção: ${avisos.join(" e ")}. A reserva pode ser criada assim mesmo.`;
}

function estadoDaSala(
  itens: AgendaItem[],
  salaId: string,
): DisponibilidadeSala {
  const daSala = itens.filter((i) => i.sala_id === salaId);
  const bloq = daSala.find((i) => i.bloqueante);
  if (bloq) {
    if (bloq.origem === "evento_interno") {
      return {
        salaId,
        estado: "evento_acimm",
        ocupante: `Evento: ${bloq.evento_titulo ?? "ACIMM"}`,
      };
    }
    if (bloq.origem === "bloqueio") {
      return {
        salaId,
        estado: "bloqueio",
        ocupante: `Bloqueio: ${bloq.motivo ?? ""}`,
      };
    }
    return {
      salaId,
      estado: "ocupado",
      ocupante: `${loc(bloq.locacao_numero)} · ${bloq.locatario ?? ""}`,
    };
  }
  const pend = daSala.find((i) => i.origem === "locacao" && !i.bloqueante);
  if (pend) {
    return { salaId, estado: "solicitado", ocupante: loc(pend.locacao_numero) };
  }
  return { salaId, estado: "livre" };
}

/** Autocomplete de associado (nome/razão/documento). */
export async function buscarAssociadosAction(
  termo: string,
): Promise<AssociadoBusca[]> {
  await requireColaborador();
  if (termo.trim().length < 2) return [];

  const admin = createAdminClient();
  const { data } = await admin.rpc("buscar_associados", {
    p_termo: termo,
    p_limite: 10,
  });

  type Row = {
    id: string;
    nome: string;
    razao_social: string | null;
    documento: string | null;
    emails: string[] | null;
    telefone: string | null;
    celular: string | null;
    whatsapp: string | null;
    situacao: "ativo" | "suspenso" | "excluido";
    codigo_sophus: number | null;
  };

  return ((data ?? []) as Row[]).map((a) => ({
    id: a.id,
    nome: a.nome,
    razaoSocial: a.razao_social,
    documento: a.documento,
    emails: a.emails ?? [],
    telefone: a.whatsapp ?? a.celular ?? a.telefone ?? null,
    situacao: a.situacao,
    codigoSophus: a.codigo_sophus ?? null,
  }));
}

/** Disponibilidade inline por sala para o horário escolhido. */
export async function consultarDisponibilidadeAction(input: {
  salaIds: string[];
  data: string;
  horaInicio: string;
  horaFim: string;
}): Promise<DisponibilidadeSala[]> {
  await requireColaborador();
  if (input.salaIds.length === 0) return [];

  const inicio = spWallParaUtc(input.data, input.horaInicio);
  const fim = spWallParaUtc(input.data, input.horaFim);
  if (Date.parse(fim) <= Date.parse(inicio)) {
    return input.salaIds.map((salaId) => ({ salaId, estado: "livre" }));
  }

  const admin = createAdminClient();
  const { data } = await admin.rpc("agenda_no_intervalo", {
    p_inicio: inicio,
    p_fim: fim,
  });
  const itens = (data ?? []) as AgendaItem[];
  return input.salaIds.map((salaId) => estadoDaSala(itens, salaId));
}

/** Dias com ocupação bloqueante das salas no mês — marcados no calendário. */
export async function ocupacoesDaSalaAction(input: {
  salaIds: string[];
  ano: number;
  mes: number; // 1-12
}): Promise<string[]> {
  await requireColaborador();
  if (input.salaIds.length === 0) return [];

  const mesPad = String(input.mes).padStart(2, "0");
  const inicioMes = spWallParaUtc(`${input.ano}-${mesPad}-01`, "00:00");
  const proximo =
    input.mes === 12
      ? `${input.ano + 1}-01-01`
      : `${input.ano}-${String(input.mes + 1).padStart(2, "0")}-01`;
  const fimMes = spWallParaUtc(proximo, "00:00");

  const admin = createAdminClient();
  const { data } = await admin.rpc("agenda_no_intervalo", {
    p_inicio: inicioMes,
    p_fim: fimMes,
  });

  const salaSet = new Set(input.salaIds);
  const dias = new Set<string>();
  for (const it of (data ?? []) as AgendaItem[]) {
    if (!salaSet.has(it.sala_id) || !it.bloqueante) continue;
    dias.add(utcParaNaiveSP(it.inicio).slice(0, 10));
  }
  return [...dias];
}

/** Resumo de valores em tempo real — o client nunca calcula preço. */
export async function calcularResumoAction(input: {
  salaIds: string[];
  data: string;
  periodo: CriarLocacaoPayload["periodo"];
  condicao: CriarLocacaoPayload["condicao"];
  coffee: { nivelId: string; qtdPessoas: number; adicionaisCentavos: number } | null;
  adicionais: { quantidade: number; valorUnitarioCentavos: number }[];
  associadoId?: string | null;
  periodoGratuitoRecusado?: boolean;
  comboId?: string | null;
  /** Valor por sala confirmado/sobrescrito pelo colaborador (Spec 34). */
  valoresManuaisPorSala?: Record<string, number>;
  descontoManual?: { tipo: "percentual" | "valor"; valor: number } | null;
}): Promise<ResumoValores> {
  await requireColaborador();

  const calc = await calcularValores({
    ...input,
    associadoId: input.condicao === "associado" ? input.associadoId : null,
    periodoGratuitoRecusado: input.periodoGratuitoRecusado,
    comboId: input.condicao === "associado" ? input.comboId : null,
    valoresManuaisPorSala: input.valoresManuaisPorSala,
    descontoManual: input.descontoManual,
  });

  const admin = createAdminClient();
  const { data: salas } = await admin
    .from("salas")
    .select("id, nome, dias_antecedencia_minima")
    .in("id", input.salaIds.length > 0 ? input.salaIds : ["00000000-0000-0000-0000-000000000000"]);
  const nome = new Map((salas ?? []).map((s) => [s.id as string, s.nome as string]));

  const aviso =
    input.salaIds.length > 0
      ? await montarAvisoAntecedencia(
          (salas ?? []).map((s) => ({
            nome: s.nome as string,
            dias_antecedencia_minima:
              (s.dias_antecedencia_minima as number | null) ?? 0,
          })),
          input.data,
          input.coffee !== null,
        )
      : null;

  return {
    salas: calc.salas.map((s) => ({
      salaId: s.salaId,
      nome: nome.get(s.salaId) ?? "Sala",
      valorCentavos: s.valorCentavos,
      semPreco: s.semPreco,
      referenciaCentavos: s.referenciaCentavos,
    })),
    salasSemPreco: calc.salasSemPreco,
    salasCentavos: calc.salasCentavos,
    coffeeCentavos: calc.coffeeCentavos,
    adicionaisCentavos: calc.adicionaisCentavos,
    descontosCentavos: calc.descontosCentavos,
    descontos: calc.descontos,
    periodoGratuito: calc.periodoGratuito,
    combo: calc.combo,
    totalCentavos: calc.totalCentavos,
    aviso,
  };
}

export interface ResultadoCriar {
  id?: string;
  error?: string;
  aprovacaoErro?: string;
  /** Aviso de antecedência (§A) — reserva criada apesar do prazo mínimo. */
  aviso?: string;
  /** Conflito de sala/horário a confirmar no pop-up (Spec 31 §7). Presente =
   * a locação NÃO foi criada; reenviar com `sobreposicaoAutorizada: true`. */
  conflitoSobreposicao?: ConflitoSobreposicao[];
  /** Lançamento retroativo levado a "Concluída" (Spec 31 §6). */
  concluida?: boolean;
}

/**
 * Lançamento retroativo (Spec 31 §6 + resultado/pagamento pedidos pela
 * ACIMM): registra o pagamento passado (pago ou pendente, conforme o
 * colaborador informou) e caminha a máquina até "Concluída" (finalizada) —
 * ou, se o evento foi cancelado, transiciona direto para `cancelada` sem
 * gerar pagamento nem comissão. Os efeitos externos seguem suprimidos pela
 * flag `retroativa` (efeitos.ts); quando o pagamento é pendente, ele fica
 * visível como pendência (badge de pagamento pendente) mesmo com a locação
 * já concluída. Devolve a mensagem de erro se algum passo falhar.
 */
async function completarRetroativa(
  admin: ReturnType<typeof createAdminClient>,
  id: string,
  opts: {
    resultado: "concluido" | "cancelado";
    pagamento: "pago" | "pendente";
    forma: FormaPagamento;
    totalCentavos: number;
    baixaEmUtc: string;
    autorUserId: string;
  },
): Promise<string | undefined> {
  if (opts.resultado === "cancelado") {
    const r = await aplicarTransicao({
      locacaoId: id,
      para: "cancelada",
      autorUserId: opts.autorUserId,
      motivo: "Evento retroativo cancelado",
    });
    return "erro" in r ? r.erro : undefined;
  }

  if (opts.totalCentavos > 0) {
    await admin.from("pagamentos").insert({
      locacao_id: id,
      descricao: "Lançamento retroativo",
      forma: opts.forma,
      valor_centavos: opts.totalCentavos,
      status: opts.pagamento === "pago" ? "pago" : "pendente",
      ...(opts.pagamento === "pago"
        ? { baixa_por: opts.autorUserId, baixa_em: opts.baixaEmUtc }
        : {}),
    });
  }

  const passos: StatusLocacao[] = [
    "em_analise",
    "aprovada",
    "contrato_enviado",
    "contrato_assinado",
    "aguardando_pagamento",
    "confirmada",
    "realizada",
    "finalizada",
  ];
  for (const para of passos) {
    const r = await aplicarTransicao({
      locacaoId: id,
      para,
      autorUserId: opts.autorUserId,
    });
    if ("erro" in r) return r.erro;
  }
  return undefined;
}

/** Submit da criação assistida (§5): revalida tudo no servidor e grava. */
export async function criarLocacaoAssistida(
  payload: CriarLocacaoPayload,
): Promise<ResultadoCriar> {
  const { user } = await requireColaborador();

  const parsed = criarLocacaoSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;
  const admin = createAdminClient();

  // (1) Salas ativas e existentes.
  const { data: salas } = await admin
    .from("salas")
    .select("id, nome, dias_antecedencia_minima")
    .in("id", v.salaIds)
    .eq("ativa", true)
    .is("excluida_em", null);
  if ((salas?.length ?? 0) !== v.salaIds.length) {
    return { error: "Uma das salas selecionadas está inativa ou não existe." };
  }

  // (1b) Antecedência mínima (§A): no assistido apenas avisa, nunca bloqueia.
  const aviso = await montarAvisoAntecedencia(
    (salas ?? []).map((s) => ({
      nome: s.nome as string,
      dias_antecedencia_minima: (s.dias_antecedencia_minima as number | null) ?? 0,
    })),
    v.data,
    v.coffee !== null,
  );

  // (2) Condição associado exige associado ativo (consulta fresca).
  if (v.condicao === "associado") {
    const { data: assoc } = await admin
      .from("associados")
      .select("situacao")
      .eq("id", v.associadoId as string)
      .maybeSingle();
    if (!assoc || assoc.situacao !== "ativo") {
      return {
        error: "Associado não está ativo — prossiga como não-associado.",
      };
    }
  }

  const inicio = spWallParaUtc(v.data, v.horaInicio);
  const fim = spWallParaUtc(v.data, v.horaFim);

  // (3) Conflito bloqueante (Spec 31 §7): sem autorização explícita, devolve o
  // conflito para o pop-up; pendente permite (assistido); autorizado prossegue e
  // grava a sobreposição. A RPC revalida com advisory lock (backstop de corrida).
  const { data: agenda } = await admin.rpc("agenda_no_intervalo", {
    p_inicio: inicio,
    p_fim: fim,
  });
  const itens = (agenda ?? []) as AgendaItem[];
  const conflitos: ConflitoSobreposicao[] = [];
  for (const salaId of v.salaIds) {
    const est = estadoDaSala(itens, salaId);
    if (est.estado !== "livre" && est.estado !== "solicitado") {
      const nome = (salas ?? []).find((s) => s.id === salaId)?.nome ?? "Sala";
      conflitos.push({ salaNome: nome, ocupante: est.ocupante ?? "ocupado" });
    }
  }
  if (conflitos.length > 0 && !v.sobreposicaoAutorizada) {
    return { conflitoSobreposicao: conflitos };
  }

  // (4) Adicionais: valores do catálogo recalculados no servidor (Spec 30).
  const resolvido = await resolverAdicionais(v.salaIds, v.adicionais, {
    permitirTextoLivre: true,
    permitirSobConsulta: true,
  });
  if (!resolvido.ok) return { error: resolvido.erro };
  const adicionaisResolvidos = resolvido.itens;

  // (4b) Recalcula do zero — valores do client são descartados.
  const coffeeAdicionaisCentavos =
    v.coffee?.adicionais.reduce((s, a) => s + a.valorCentavos, 0) ?? 0;
  const calc = await calcularValores({
    salaIds: v.salaIds,
    data: v.data,
    periodo: v.periodo,
    condicao: v.condicao,
    coffee: v.coffee
      ? {
          nivelId: v.coffee.nivelId,
          qtdPessoas: v.coffee.qtdPessoas,
          adicionaisCentavos: coffeeAdicionaisCentavos,
        }
      : null,
    adicionais: adicionaisResolvidos.map((a) => ({
      quantidade: a.quantidade,
      valorUnitarioCentavos: a.valorUnitarioCentavos,
    })),
    associadoId: v.condicao === "associado" ? v.associadoId : null,
    periodoGratuitoRecusado: v.periodoGratuitoRecusado,
    comboId: v.condicao === "associado" ? v.comboId : null,
    valoresManuaisPorSala: v.valoresManuaisPorSala,
    descontoManual: v.descontoManual,
  });

  // Combo (Spec 20 §3): exclusivo de sócio; recalculado no servidor — se o
  // payload trouxe combo inelegível, rejeita (nunca aplica desconto forjado).
  if (v.comboId) {
    if (v.condicao !== "associado") {
      return { error: "Combos são exclusivos de associados." };
    }
    if (!calc.combo?.aplicado) {
      return {
        error:
          "O combo selecionado não é válido para esta seleção. Revise salas, data e período.",
      };
    }
  }

  if (calc.salasSemPreco.length > 0) {
    const nomes = (salas ?? []).filter((s) =>
      calc.salasSemPreco.includes(s.id as string),
    );
    return {
      error: `Sem preço cadastrado para ${nomes.length} sala(s) no período "${v.periodo}" (${v.condicao === "associado" ? "associado" : "não-associado"}) nessa data. Cadastre em Salas › Preços.`,
    };
  }

  // Respostas do formulário dinâmico validadas contra os campos ATIVOS (§4).
  const respForm = await validarRespostasFormulario(v.respostasFormulario);
  if (!respForm.ok) {
    return { error: respForm.erro };
  }

  // (5) Insere tudo numa transação (RPC).
  const coffeePayload = v.coffee
    ? {
        nivel_id: v.coffee.nivelId,
        qtd_pessoas: v.coffee.qtdPessoas,
        horario_servir: v.coffee.horarioServir
          ? spWallParaUtc(v.data, v.coffee.horarioServir)
          : null,
        adicionais: v.coffee.adicionais,
        observacoes: v.coffee.observacoes,
        valor: calc.coffeeCentavos,
      }
    : null;

  // Período gratuito (Spec 20 §5.3): consumido na MESMA transação da RPC.
  const pg = calc.periodoGratuito;
  const gratuitoPayload =
    pg?.aplicado
      ? {
          sala_id: pg.salaId,
          ciclo: pg.ciclo,
          horas: (Date.parse(fim) - Date.parse(inicio)) / 3_600_000,
        }
      : null;

  const { data: novoId, error } = await admin.rpc("criar_locacao_assistida", {
    p_condicao: v.condicao,
    p_associado_id: v.associadoId,
    p_nome: v.locatarioNome,
    p_documento: v.locatarioDocumento,
    p_email: v.locatarioEmail,
    p_telefone: v.locatarioTelefone,
    p_responsavel_nome: v.responsavelNome,
    p_inicio: inicio,
    p_fim: fim,
    p_periodo: v.periodo,
    p_qtd_pessoas: v.qtdPessoas,
    p_tipo_evento: v.tipoEvento,
    p_observacoes: v.observacoes,
    p_respostas: respForm.valores,
    p_forma: v.formaPagamento,
    p_valor_salas: calc.salasCentavos,
    p_valor_coffee: calc.coffeeCentavos,
    p_valor_adicionais: calc.adicionaisCentavos,
    p_valor_total: calc.totalCentavos,
    p_salas: calc.salas.map((s) => ({ sala_id: s.salaId, valor: s.valorCentavos })),
    p_coffee: coffeePayload,
    p_adicionais: adicionaisResolvidos.map((a) => ({
      servico_adicional_id: a.servicoAdicionalId,
      descricao: a.descricao,
      quantidade: a.quantidade,
      valor_unitario: a.valorUnitarioCentavos,
    })),
    p_autor: user.id,
    p_fila_espera_id: v.filaEsperaId ?? null,
    p_valor_descontos: calc.descontosCentavos,
    p_periodo_gratuito_aplicado: Boolean(gratuitoPayload),
    p_periodo_gratuito: gratuitoPayload,
    p_sobreposicao_autorizada: v.sobreposicaoAutorizada,
    p_retroativa: v.retroativa,
  });

  if (error || !novoId) {
    return { error: "Não foi possível criar a locação." };
  }
  // Corrida (Spec 31 §7): o slot foi ocupado entre a checagem e a gravação.
  if (novoId === "conflito_agenda") {
    return {
      conflitoSobreposicao:
        conflitos.length > 0
          ? conflitos
          : [
              {
                salaNome: "",
                ocupante: "o horário acabou de ser ocupado",
              },
            ],
    };
  }
  if (novoId === "beneficio_indisponivel") {
    return {
      error:
        "O período gratuito desta sala foi utilizado em outra reserva. Confira o total atualizado e envie novamente.",
    };
  }
  const id = novoId as string;

  // Vínculo do combo (metadado): best-effort pós-insert (Spec 20 §3).
  if (calc.combo?.aplicado) {
    await admin.from("locacoes").update({ combo_id: calc.combo.id }).eq("id", id);
  }

  // (5b) Auditoria de valor manual/desconto manual (Spec 34): registra uma
  // linha extra no histórico só quando houver algo fora do calculado por
  // resolverPreco() — best-effort, não bloqueia a criação.
  const notaPartes: string[] = [];
  const divergentes = calc.salas.filter((s) => s.valorCentavos !== s.referenciaCentavos);
  if (divergentes.length > 0) {
    const nomeSala = new Map(
      (salas ?? []).map((s) => [s.id as string, s.nome as string]),
    );
    const linhas = divergentes.map((s) => {
      const nome = nomeSala.get(s.salaId) ?? "sala";
      const ref =
        s.referenciaCentavos != null
          ? centavosParaBRL(s.referenciaCentavos)
          : "sem preço de referência";
      return `${nome}: ${centavosParaBRL(s.valorCentavos)} (ref. ${ref})`;
    });
    notaPartes.push(`Valor manual — ${linhas.join("; ")}`);
  }
  if (v.descontoManual) {
    const desc =
      v.descontoManual.tipo === "percentual"
        ? `${v.descontoManual.valor}%`
        : centavosParaBRL(v.descontoManual.valor);
    notaPartes.push(
      `Desconto manual — ${desc}${v.descontoManual.motivo ? ` (${v.descontoManual.motivo})` : ""}`,
    );
  }
  if (notaPartes.length > 0) {
    const { data: locAtual } = await admin
      .from("locacoes")
      .select("status")
      .eq("id", id)
      .maybeSingle();
    const status = (locAtual?.status as StatusLocacao | undefined) ?? "solicitada";
    await admin.from("locacao_eventos").insert({
      locacao_id: id,
      de: status,
      para: status,
      autor_user_id: user.id,
      observacao: notaPartes.join(" · "),
    });
  }

  // (6a) Lançamento retroativo (Spec 31 §6): registra o resultado (concluído
  // ou cancelado) e o pagamento (pago ou pendente) informados, sem automações
  // (efeitos suprimidos pela flag).
  if (v.retroativa) {
    const erroRetro = await completarRetroativa(admin, id, {
      resultado: v.retroativaResultado,
      pagamento: v.retroativaPagamento,
      forma: v.formaPagamento ?? "dinheiro",
      totalCentavos: calc.totalCentavos,
      baixaEmUtc: fim,
      autorUserId: user.id,
    });
    revalidatePath("/admin/locacoes");
    revalidatePath("/admin/calendario");
    revalidatePath("/admin");
    return {
      id,
      concluida: v.retroativaResultado === "concluido",
      aprovacaoErro: erroRetro,
      aviso: aviso ?? undefined,
    };
  }

  // (6b) Criar e aprovar: falha de aprovação NÃO desfaz a criação.
  let aprovacaoErro: string | undefined;
  if (v.aprovar) {
    const r = await transicionarLocacao({ locacaoId: id, para: "aprovada" });
    if ("erro" in r) aprovacaoErro = r.erro;
  }

  revalidatePath("/admin/locacoes");
  revalidatePath("/admin/calendario");
  revalidatePath("/admin");
  return { id, aprovacaoErro, aviso: aviso ?? undefined };
}
