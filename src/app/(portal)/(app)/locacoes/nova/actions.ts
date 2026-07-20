"use server";

import { revalidatePath } from "next/cache";
import { requireAssociado } from "@/lib/auth/guards";
import { spWallParaUtc } from "@/lib/calendario/tempo";
import {
  dataMaximaSP,
  dentroDaJanela,
  hojeSP,
  somarDias,
} from "@/lib/disponibilidade/janela";
import type { CategoriaHoraAdicional, PeriodoDia } from "@/lib/dominio";
import { calcularValores } from "@/lib/locacoes/calcular";
import { dispararEfeitos } from "@/lib/locacoes/efeitos";
import { obterHorariosPeriodos } from "@/lib/locacoes/horarios";
import type { HorariosPeriodos } from "@/lib/locacoes/horarios";
import { createAdminClient } from "@/lib/supabase/admin";
import { apenasDigitos, documentoValido } from "@/lib/utils/documento";
import { criarSolicitacaoSchema } from "@/lib/validacoes/solicitacao";

/** Tipos compartilhados server ↔ client da solicitação do associado (Spec 11). */

export interface HoraAdicionalInfo {
  nome: string;
  aposMinutos: number;
  valorHoraCentavos: number;
}

export interface ResumoSolicitacao {
  salas: {
    salaId: string;
    nome: string;
    valorCentavos: number;
    semPreco: boolean;
  }[];
  salasSemPreco: string[];
  salasCentavos: number;
  coffeeCentavos: number;
  totalCentavos: number;
  /** Informativo: hora adicional após o período configurado, por sala. */
  horaAdicional: HoraAdicionalInfo[];
}

export interface ResultadoSolicitacao {
  id?: string;
  error?: string;
}

export interface SolicitacaoPayload {
  salaIds: string[];
  data: string;
  periodo: PeriodoDia;
  terceiro: boolean;
  emailContato: string;
  telefoneContato: string;
  responsavelNome: string;
  terceiroNome: string;
  terceiroDocumento: string;
  terceiroEmail: string;
  terceiroTelefone: string;
  qtdPessoas: number;
  tipoEvento: string;
  observacoes: string;
  respostasFormulario: Record<string, unknown>;
  coffee: {
    nivelId: string;
    qtdPessoas: number;
    horarioServir: string | null;
    adicionais: { descricao: string; valorCentavos: number }[];
    observacoes: string;
  } | null;
  formaPagamento:
    | "pix"
    | "transferencia"
    | "boleto_avulso"
    | "boleto_mensalidade"
    | null;
}

interface AgendaItem {
  sala_id: string;
  origem: "locacao" | "evento_interno" | "bloqueio";
  bloqueante: boolean;
  inicio: string;
  fim: string;
  evento_titulo: string | null;
}

/** Faixa [inicioMs, fimMs) de conflito do período. Dia inteiro = união. */
function rangePeriodo(
  data: string,
  periodo: PeriodoDia,
  horarios: HorariosPeriodos,
): { inicioMs: number; fimMs: number } {
  if (periodo === "dia_inteiro") {
    const inicios = [
      horarios.manha.inicio,
      horarios.tarde.inicio,
      horarios.noite.inicio,
    ];
    const fins = [horarios.manha.fim, horarios.tarde.fim, horarios.noite.fim];
    return {
      inicioMs: Date.parse(spWallParaUtc(data, inicios.reduce((a, b) => (a < b ? a : b)))),
      fimMs: Date.parse(spWallParaUtc(data, fins.reduce((a, b) => (a > b ? a : b)))),
    };
  }
  const f = horarios[periodo];
  return {
    inicioMs: Date.parse(spWallParaUtc(data, f.inicio)),
    fimMs: Date.parse(spWallParaUtc(data, f.fim)),
  };
}

/** Categoria da hora adicional (comercial/noturno/sábado-domingo) do slot. */
function categoriaHoraAdicional(
  data: string,
  periodo: PeriodoDia,
): CategoriaHoraAdicional {
  const [y, m, d] = data.split("-").map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0=Dom … 6=Sáb
  if (dow === 0 || dow === 6) return "sabado_domingo";
  if (periodo === "noite") return "noturno";
  return "comercial";
}

/** Info (não cobrada aqui) de hora adicional por sala para o slot escolhido. */
async function infoHoraAdicional(
  admin: ReturnType<typeof createAdminClient>,
  salaIds: string[],
  data: string,
  periodo: PeriodoDia,
): Promise<HoraAdicionalInfo[]> {
  const [salasRes, precosRes] = await Promise.all([
    admin.from("salas").select("id, nome, hora_adicional_minutos").in("id", salaIds),
    admin
      .from("precos_hora_adicional")
      .select("sala_id, valor_centavos")
      .eq("condicao", "associado")
      .eq("categoria", categoriaHoraAdicional(data, periodo))
      .in("sala_id", salaIds),
  ]);
  const valorPorSala = new Map(
    (precosRes.data ?? []).map((p) => [
      p.sala_id as string,
      p.valor_centavos as number,
    ]),
  );
  const info: HoraAdicionalInfo[] = [];
  for (const s of salasRes.data ?? []) {
    const minutos = s.hora_adicional_minutos as number | null;
    const valor = valorPorSala.get(s.id as string);
    if (minutos && minutos > 0 && valor !== undefined) {
      info.push({
        nome: s.nome as string,
        aposMinutos: minutos,
        valorHoraCentavos: valor,
      });
    }
  }
  return info;
}

/** Resumo de valores em tempo real — o client nunca calcula preço (§4/§5). */
export async function previewValores(input: {
  salaIds: string[];
  data: string;
  periodo: PeriodoDia;
  coffee: { nivelId: string; qtdPessoas: number; adicionaisCentavos: number } | null;
}): Promise<ResumoSolicitacao> {
  const { associado } = await requireAssociado();
  const vazio: ResumoSolicitacao = {
    salas: [],
    salasSemPreco: [],
    salasCentavos: 0,
    coffeeCentavos: 0,
    totalCentavos: 0,
    horaAdicional: [],
  };
  if (associado.situacao !== "ativo" || input.salaIds.length === 0) return vazio;

  const admin = createAdminClient();
  const [calc, salasRows, horaAdicional] = await Promise.all([
    calcularValores({
      salaIds: input.salaIds,
      data: input.data,
      periodo: input.periodo,
      condicao: "associado",
      coffee: input.coffee
        ? {
            nivelId: input.coffee.nivelId,
            qtdPessoas: input.coffee.qtdPessoas,
            adicionaisCentavos: input.coffee.adicionaisCentavos,
          }
        : null,
      adicionais: [],
    }),
    admin.from("salas").select("id, nome").in("id", input.salaIds),
    infoHoraAdicional(admin, input.salaIds, input.data, input.periodo),
  ]);

  const nome = new Map(
    (salasRows.data ?? []).map((s) => [s.id as string, s.nome as string]),
  );

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
    totalCentavos: calc.totalCentavos,
    horaAdicional,
  };
}

/**
 * Próximas datas (até 5) com o período livre em TODAS as salas escolhidas
 * (§4 etapa 1, saída de "ocupado"). Uma única leitura da agenda na janela;
 * "livre" = sem qualquer sobreposição (bloqueante OU pendente).
 */
export async function sugerirDatas(input: {
  salaIds: string[];
  periodo: PeriodoDia;
  aPartirDe: string;
}): Promise<string[]> {
  const { associado } = await requireAssociado();
  if (associado.situacao !== "ativo") return [];
  if (input.salaIds.length === 0) return [];

  const hoje = hojeSP();
  const base =
    /^\d{4}-\d{2}-\d{2}$/.test(input.aPartirDe) && input.aPartirDe >= hoje
      ? input.aPartirDe
      : hoje;
  const inicioScan = somarDias(base, 1); // a partir do dia seguinte
  const dataMax = dataMaximaSP();
  if (inicioScan > dataMax) return [];

  const horarios = await obterHorariosPeriodos();
  const admin = createAdminClient();
  const { data: agenda } = await admin.rpc("agenda_no_intervalo", {
    p_inicio: spWallParaUtc(inicioScan, "00:00"),
    p_fim: spWallParaUtc(somarDias(dataMax, 1), "00:00"),
  });

  const salaSet = new Set(input.salaIds);
  const ocupPorSala = new Map<string, { inicioMs: number; fimMs: number }[]>();
  for (const it of (agenda ?? []) as AgendaItem[]) {
    if (!salaSet.has(it.sala_id)) continue;
    const lista = ocupPorSala.get(it.sala_id) ?? [];
    lista.push({ inicioMs: Date.parse(it.inicio), fimMs: Date.parse(it.fim) });
    ocupPorSala.set(it.sala_id, lista);
  }

  const datas: string[] = [];
  let d = inicioScan;
  while (d <= dataMax && datas.length < 5) {
    const range = rangePeriodo(d, input.periodo, horarios);
    const todasLivres = input.salaIds.every((salaId) => {
      const ocup = ocupPorSala.get(salaId) ?? [];
      return !ocup.some(
        (o) => o.inicioMs < range.fimMs && o.fimMs > range.inicioMs,
      );
    });
    if (todasLivres) datas.push(d);
    d = somarDias(d, 1);
  }
  return datas;
}

/** Submit da solicitação (§5): guard + ativo fresco → Zod → revalidações. */
export async function criarSolicitacao(
  payload: SolicitacaoPayload,
): Promise<ResultadoSolicitacao> {
  const { user, associado } = await requireAssociado();
  // (guard) situação avaliada fresca no servidor — não confia na sessão/banner.
  if (associado.situacao !== "ativo") {
    return {
      error: "Sua situação junto à ACIMM não permite novas solicitações.",
    };
  }

  const parsed = criarSolicitacaoSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;

  if (!dentroDaJanela(v.data)) {
    return { error: "Data fora do período disponível para solicitação." };
  }

  const admin = createAdminClient();

  // (1a) Limite de 5 solicitações abertas por associado.
  const { count } = await admin
    .from("locacoes")
    .select("id", { count: "exact", head: true })
    .eq("associado_id", associado.id)
    .in("status", ["solicitada", "em_analise"]);
  if ((count ?? 0) >= 5) {
    return {
      error:
        "Você já tem 5 solicitações em aberto. Aguarde a análise ou fale com a ACIMM.",
    };
  }

  // (1b) Salas ativas e existentes.
  const { data: salas } = await admin
    .from("salas")
    .select("id")
    .in("id", v.salaIds)
    .eq("ativa", true)
    .is("excluida_em", null);
  if ((salas?.length ?? 0) !== v.salaIds.length) {
    return { error: "Uma das salas selecionadas está indisponível." };
  }

  const horarios = await obterHorariosPeriodos();
  const faixa = horarios[v.periodo];
  const inicio = spWallParaUtc(v.data, faixa.inicio);
  const fim = spWallParaUtc(v.data, faixa.fim);

  // (2) Disponibilidade re-checada: no portal, QUALQUER sobreposição barra —
  // inclusive pendente (§8.3b). Última linha antes da corrida entre associados.
  const { data: agenda } = await admin.rpc("agenda_no_intervalo", {
    p_inicio: inicio,
    p_fim: fim,
  });
  const itens = (agenda ?? []) as AgendaItem[];
  for (const salaId of v.salaIds) {
    const rows = itens.filter((i) => i.sala_id === salaId);
    if (rows.length === 0) continue;
    if (rows.some((r) => r.origem === "evento_interno")) {
      const titulo = rows.find((r) => r.origem === "evento_interno")?.evento_titulo;
      return {
        error: `Este horário está reservado para um evento da ACIMM${titulo ? ` (${titulo})` : ""}. Escolha outra data ou fale com a ACIMM.`,
      };
    }
    const pendente = rows.every((r) => r.origem === "locacao" && !r.bloqueante);
    return {
      error: pendente
        ? "Este horário já foi solicitado por outro associado e aguarda aprovação. Escolha outra data ou entre na fila de espera."
        : "Este horário ficou indisponível. Escolha outra data ou entre na fila de espera.",
    };
  }

  // (3) Recalcula do zero — valores do client são descartados.
  const coffeeAdicionaisCentavos =
    v.coffee?.adicionais.reduce((s, a) => s + a.valorCentavos, 0) ?? 0;
  const calc = await calcularValores({
    salaIds: v.salaIds,
    data: v.data,
    periodo: v.periodo,
    condicao: "associado",
    coffee: v.coffee
      ? {
          nivelId: v.coffee.nivelId,
          qtdPessoas: v.coffee.qtdPessoas,
          adicionaisCentavos: coffeeAdicionaisCentavos,
        }
      : null,
    adicionais: [],
  });
  if (calc.salasSemPreco.length > 0) {
    return {
      error:
        "Não há preço cadastrado para o período escolhido nesta data. Escolha outro período ou fale com a ACIMM.",
    };
  }

  // Snapshot do locatário: associado por padrão; terceiro quando marcado (§8.6).
  const doc = v.terceiro
    ? apenasDigitos(v.terceiroDocumento)
    : (associado.documento ?? "");
  if (!documentoValido(doc)) {
    return {
      error:
        "Cadastro incompleto para gerar o contrato. Fale com a ACIMM para atualizar seus dados.",
    };
  }
  const nome = v.terceiro
    ? v.terceiroNome.trim()
    : (associado.razao_social ?? associado.nome);
  const email = v.terceiro
    ? v.terceiroEmail.trim()
    : associado.emails.includes(v.emailContato)
      ? v.emailContato
      : (associado.emails[0] ?? v.emailContato);
  const telefone = v.terceiro
    ? v.terceiroTelefone.trim()
    : v.telefoneContato.trim();

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

  // (4) Escrita transacional (RPC — status 'solicitada', criado_por = associado).
  const { data: novoId, error } = await admin.rpc("criar_solicitacao_portal", {
    p_associado_id: associado.id,
    p_nome: nome,
    p_documento: doc,
    p_email: email,
    p_telefone: telefone,
    p_responsavel_nome: v.responsavelNome,
    p_inicio: inicio,
    p_fim: fim,
    p_periodo: v.periodo,
    p_qtd_pessoas: v.qtdPessoas,
    p_tipo_evento: v.tipoEvento,
    p_observacoes: v.observacoes,
    p_respostas: v.respostasFormulario,
    p_forma: v.formaPagamento,
    p_valor_salas: calc.salasCentavos,
    p_valor_coffee: calc.coffeeCentavos,
    p_valor_total: calc.totalCentavos,
    p_salas: calc.salas.map((s) => ({ sala_id: s.salaId, valor: s.valorCentavos })),
    p_coffee: coffeePayload,
    p_autor: user.id,
  });
  if (error || !novoId) {
    return {
      error: "Não foi possível registrar sua solicitação. Tente novamente.",
    };
  }
  const id = novoId as string;

  // (5) Efeito pós-criação (no-op/log até o Spec 15).
  await dispararEfeitos({
    locacaoId: id,
    de: null,
    para: "solicitada",
    autorUserId: user.id,
  });

  revalidatePath("/locacoes");
  revalidatePath("/admin/locacoes");
  revalidatePath("/admin/calendario");
  revalidatePath("/admin");
  return { id };
}
