"use server";

import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { spWallParaUtc, utcParaNaiveSP } from "@/lib/calendario/tempo";
import { validarRespostasFormulario } from "@/lib/formulario/validacao";
import { calcularValores } from "@/lib/locacoes/calcular";
import { transicionarLocacao } from "@/lib/locacoes/maquina-estados";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarLocacaoSchema } from "@/lib/validacoes/locacao-assistida";
import type {
  AssociadoBusca,
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
  };

  return ((data ?? []) as Row[]).map((a) => ({
    id: a.id,
    nome: a.nome,
    razaoSocial: a.razao_social,
    documento: a.documento,
    emails: a.emails ?? [],
    telefone: a.whatsapp ?? a.celular ?? a.telefone ?? null,
    situacao: a.situacao,
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
}): Promise<ResumoValores> {
  await requireColaborador();

  const calc = await calcularValores({
    ...input,
    associadoId: input.condicao === "associado" ? input.associadoId : null,
    periodoGratuitoRecusado: input.periodoGratuitoRecusado,
    comboId: input.condicao === "associado" ? input.comboId : null,
  });

  const admin = createAdminClient();
  const { data: salas } = await admin
    .from("salas")
    .select("id, nome")
    .in("id", input.salaIds.length > 0 ? input.salaIds : ["00000000-0000-0000-0000-000000000000"]);
  const nome = new Map((salas ?? []).map((s) => [s.id as string, s.nome as string]));

  return {
    salas: calc.salas.map((s) => ({
      salaId: s.salaId,
      nome: nome.get(s.salaId) ?? "Sala",
      valorCentavos: s.valorCentavos,
      semPreco: s.semPreco,
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
  };
}

export interface ResultadoCriar {
  id?: string;
  error?: string;
  aprovacaoErro?: string;
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
    .select("id")
    .in("id", v.salaIds)
    .eq("ativa", true)
    .is("excluida_em", null);
  if ((salas?.length ?? 0) !== v.salaIds.length) {
    return { error: "Uma das salas selecionadas está inativa ou não existe." };
  }

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

  // (3) Conflito: bloqueante sobreposto rejeita; pendente permite (assistido).
  const { data: agenda } = await admin.rpc("agenda_no_intervalo", {
    p_inicio: inicio,
    p_fim: fim,
  });
  const itens = (agenda ?? []) as AgendaItem[];
  for (const salaId of v.salaIds) {
    const est = estadoDaSala(itens, salaId);
    if (est.estado !== "livre" && est.estado !== "solicitado") {
      return {
        error: `Horário indisponível — já ocupado por ${est.ocupante}. Ajuste sala/horário.`,
      };
    }
  }

  // (4) Recalcula do zero — valores do client são descartados.
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
    adicionais: v.adicionais,
    associadoId: v.condicao === "associado" ? v.associadoId : null,
    periodoGratuitoRecusado: v.periodoGratuitoRecusado,
    comboId: v.condicao === "associado" ? v.comboId : null,
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
    p_adicionais: v.adicionais.map((a) => ({
      descricao: a.descricao,
      quantidade: a.quantidade,
      valor_unitario: a.valorUnitarioCentavos,
    })),
    p_autor: user.id,
    p_fila_espera_id: v.filaEsperaId ?? null,
    p_valor_descontos: calc.descontosCentavos,
    p_periodo_gratuito_aplicado: Boolean(gratuitoPayload),
    p_periodo_gratuito: gratuitoPayload,
  });

  if (error || !novoId) {
    return { error: "Não foi possível criar a locação." };
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

  // (6) Criar e aprovar: falha de aprovação NÃO desfaz a criação.
  let aprovacaoErro: string | undefined;
  if (v.aprovar) {
    const r = await transicionarLocacao({ locacaoId: id, para: "aprovada" });
    if ("erro" in r) aprovacaoErro = r.erro;
  }

  revalidatePath("/admin/locacoes");
  revalidatePath("/admin/calendario");
  revalidatePath("/admin");
  return { id, aprovacaoErro };
}
