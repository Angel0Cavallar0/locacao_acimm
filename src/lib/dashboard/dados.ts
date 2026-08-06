import "server-only";
import { spWallParaUtc, utcParaNaiveSP } from "@/lib/calendario/tempo";
import { detectarSobreposicoes } from "@/lib/calendario/sobreposicoes";
import type { AgendaItem } from "@/lib/calendario/tipos";
import { hojeSP, somarDias } from "@/lib/disponibilidade/janela";
import type { StatusLocacao } from "@/lib/locacoes/maquina-estados-core";
import { rotuloLocacao } from "@/lib/locacoes/tipos";
import { obterHorariosPeriodos } from "@/lib/locacoes/horarios";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type Intervalo,
  ocupacaoPorSala,
  percentualOcupacao,
  type SlotDisponivel,
  totalOcupacao,
} from "./ocupacao-core";
import type {
  AcaoNecessaria,
  DashboardData,
  LocacaoResumo,
  OcupacaoSala,
  TipoAcao,
} from "./tipos";

/**
 * Agregador ÚNICO do dashboard (Spec 23 §6). Uma passada server-side: nada é
 * calculado no client, nenhum dado novo é exposto (tudo já visível nas telas de
 * origem). Consultas paralelas; volumes reais da ACIMM (dezenas/mês) dão folga.
 */

const PENDENTES: StatusLocacao[] = ["solicitada", "em_analise"];
// "≥ aprovada": ocupam a agenda e contam como locação da semana.
const ATIVAS: StatusLocacao[] = [
  "aprovada",
  "contrato_enviado",
  "contrato_assinado",
  "aguardando_pagamento",
  "confirmada",
  "realizada",
  "finalizada",
];
const RECEITA: StatusLocacao[] = ["confirmada", "realizada", "finalizada"];
const PIPELINE: StatusLocacao[] = [
  "aprovada",
  "contrato_enviado",
  "contrato_assinado",
  "aguardando_pagamento",
];
// Estados que, ao cair, liberavam vaga bloqueante (Spec 19 §6).
const BLOQUEANTES_DE: StatusLocacao[] = [...ATIVAS];

const PRIORIDADE: Record<TipoAcao, number> = {
  solicitacao: 0,
  comprovante: 1,
  contrato_recusado: 2,
  notificacao_falha: 3,
  sobreposicao: 4,
  vaga_fila: 5,
};

function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function nomesDeSalas(rel: unknown): string[] {
  if (!Array.isArray(rel)) return [];
  const nomes: string[] = [];
  for (const ls of rel) {
    const s = (ls as { salas: unknown }).salas;
    const nome = Array.isArray(s)
      ? (s[0] as { nome?: string })?.nome
      : (s as { nome?: string })?.nome;
    if (nome) nomes.push(nome);
  }
  return nomes;
}

interface AgendaRpcRow {
  id: string;
  sala_id: string;
  sala_nome: string;
  inicio: string;
  fim: string;
  origem: AgendaItem["origem"];
  bloqueante: boolean;
  motivo: string | null;
  responsavel_id: string | null;
  locacao_id: string | null;
  locacao_numero: number | null;
  locatario: string | null;
  status: StatusLocacao | null;
  evento_id: string | null;
  evento_titulo: string | null;
}

/** Agenda "leve" (sem resolver nome de responsável — o dashboard não usa). */
async function carregarAgendaLeve(
  admin: ReturnType<typeof createAdminClient>,
  inicioUtc: string,
  fimUtc: string,
): Promise<AgendaItem[]> {
  const { data } = await admin.rpc("agenda_no_intervalo", {
    p_inicio: inicioUtc,
    p_fim: fimUtc,
  });
  return ((data ?? []) as AgendaRpcRow[]).map((l) => ({
    id: l.id,
    salaId: l.sala_id,
    salaNome: l.sala_nome,
    inicioUtc: l.inicio,
    fimUtc: l.fim,
    origem: l.origem,
    bloqueante: l.bloqueante,
    responsavelId: l.responsavel_id,
    responsavelNome: null,
    locacaoId: l.locacao_id,
    locacaoNumero: l.locacao_numero,
    locatario: l.locatario,
    status: l.status,
    eventoId: l.evento_id,
    eventoTitulo: l.evento_titulo,
    motivo: l.motivo,
  }));
}

export async function carregarDashboard(opts?: {
  /** Período da RECEITA (Spec 32 §1.1), 'YYYY-MM-DD' inclusivos. Default = mês. */
  receitaDeISO?: string;
  receitaAteISO?: string;
}): Promise<DashboardData> {
  const admin = createAdminClient();

  const hoje = hojeSP();
  const [ano, mes] = hoje.split("-").map(Number);
  const mesPad = String(mes).padStart(2, "0");
  const inicioMesISO = `${ano}-${mesPad}-01`;
  const proxMesISO =
    mes === 12
      ? `${ano + 1}-01-01`
      : `${ano}-${String(mes + 1).padStart(2, "0")}-01`;
  const inicioMesUtc = spWallParaUtc(inicioMesISO, "00:00");
  const fimMesUtc = spWallParaUtc(proxMesISO, "00:00");

  // Período da receita (§1.1): default = mês corrente; custom = range inclusivo.
  const receitaDeISO = opts?.receitaDeISO ?? inicioMesISO;
  const receitaAteISO = opts?.receitaAteISO ?? somarDias(proxMesISO, -1);
  const receitaCustom = Boolean(opts?.receitaDeISO || opts?.receitaAteISO);
  const receitaDeUtc = spWallParaUtc(receitaDeISO, "00:00");
  // `ate` é inclusivo → limite exclusivo é o dia seguinte às 00:00.
  const receitaFimUtc = spWallParaUtc(somarDias(receitaAteISO, 1), "00:00");

  const fimSemanaISO = somarDias(hoje, 7);
  const inicioSemanaUtc = spWallParaUtc(hoje, "00:00");
  const fimSemanaUtc = spWallParaUtc(fimSemanaISO, "23:59");

  const agoraUtc = spWallParaUtc(hoje, "00:00");
  const em30ISO = somarDias(hoje, 30);
  const fim30Utc = spWallParaUtc(em30ISO, "23:59");
  const sete = somarDias(hoje, -7);
  const seteAtrasUtc = spWallParaUtc(sete, "00:00");

  const horarios = await obterHorariosPeriodos();

  const [
    pendentesRes,
    semanaRes,
    mesRes,
    salasRes,
    regrasRes,
    pagamentosRes,
    contratosRes,
    notifRes,
    filaRes,
    cancelRes,
    agendaMes,
    agenda30,
  ] = await Promise.all([
    admin
      .from("locacoes")
      .select("id, numero, criado_em")
      .in("status", PENDENTES)
      .order("criado_em", { ascending: true }),
    admin
      .from("locacoes")
      .select(
        "id, numero, inicio, fim, locatario_nome, status, locacao_salas ( salas ( nome ) )",
      )
      .gte("inicio", inicioSemanaUtc)
      .lte("inicio", fimSemanaUtc)
      .in("status", ATIVAS)
      .order("inicio", { ascending: true }),
    admin
      .from("locacoes")
      .select(
        "valor_salas_centavos, valor_coffee_centavos, valor_total_centavos, status",
      )
      .gte("inicio", receitaDeUtc)
      .lt("inicio", receitaFimUtc),
    admin
      .from("salas")
      .select("id, nome")
      .eq("ativa", true)
      .is("excluida_em", null)
      .order("ordem", { ascending: true }),
    admin.from("regras_periodo_gratuito").select("sala_id").eq("ativo", true),
    admin
      .from("pagamentos")
      .select("id, criado_em, locacao_id, locacoes ( numero )")
      .eq("status", "pendente")
      .not("comprovante_url", "is", null)
      .order("criado_em", { ascending: true }),
    admin
      .from("contratos")
      .select("id, criado_em, locacao_id, locacoes ( numero )")
      .eq("status", "recusado")
      .order("criado_em", { ascending: true }),
    admin
      .from("notificacoes")
      .select("id, locacao_id, criado_em, locacoes ( numero )")
      .eq("status", "falha")
      .not("locacao_id", "is", null)
      .order("criado_em", { ascending: true }),
    admin
      .from("lista_espera")
      .select("sala_id, data")
      .is("convertido_locacao_id", null)
      .is("arquivado_em", null)
      .gte("data", hoje),
    admin
      .from("locacao_eventos")
      .select("locacao_id, criado_em")
      .in("para", ["cancelada", "recusada"])
      .in("de", BLOQUEANTES_DE)
      .gte("criado_em", seteAtrasUtc)
      .order("criado_em", { ascending: false }),
    carregarAgendaLeve(admin, inicioMesUtc, fimMesUtc),
    carregarAgendaLeve(admin, agoraUtc, fim30Utc),
  ]);

  const acoes: AcaoNecessaria[] = [];

  // (1) Solicitações aguardando análise.
  const pendentes = (pendentesRes.data ?? []) as {
    id: string;
    numero: number;
    criado_em: string;
  }[];
  for (const p of pendentes) {
    const dias = Math.floor(
      (Date.parse(agoraUtc) - Date.parse(p.criado_em)) / 86_400_000,
    );
    acoes.push({
      id: `sol-${p.id}`,
      tipo: "solicitacao",
      texto:
        dias <= 0
          ? `Solicitação ${rotuloLocacao(p.numero)} aguardando análise`
          : `Solicitação ${rotuloLocacao(p.numero)} aguardando análise há ${dias} dia${dias === 1 ? "" : "s"}`,
      href: `/admin/locacoes/${p.id}`,
      dataRefUtc: p.criado_em,
    });
  }

  // (2) Comprovantes recebidos aguardando baixa.
  for (const p of (pagamentosRes.data ?? []) as {
    id: string;
    criado_em: string;
    locacao_id: string;
    locacoes: { numero: number } | { numero: number }[] | null;
  }[]) {
    const numero = um(p.locacoes)?.numero ?? 0;
    acoes.push({
      id: `pag-${p.id}`,
      tipo: "comprovante",
      texto: `Comprovante recebido aguardando baixa — ${rotuloLocacao(numero)}`,
      href: `/admin/locacoes/${p.locacao_id}`,
      dataRefUtc: p.criado_em,
    });
  }

  // (3) Contratos recusados na assinatura.
  for (const c of (contratosRes.data ?? []) as {
    id: string;
    criado_em: string;
    locacao_id: string;
    locacoes: { numero: number } | { numero: number }[] | null;
  }[]) {
    const numero = um(c.locacoes)?.numero ?? 0;
    acoes.push({
      id: `ctr-${c.id}`,
      tipo: "contrato_recusado",
      texto: `Contrato recusado na assinatura — ${rotuloLocacao(numero)}`,
      href: `/admin/locacoes/${c.locacao_id}`,
      dataRefUtc: c.criado_em,
    });
  }

  // (4) Notificações em falha definitiva — agrupadas por locação (o par de
  // canais gera 2 linhas; internas sem locação ficam fora — sem alvo direto).
  const falhasPorLoc = new Map<
    string,
    { numero: number; qtd: number; primeira: string }
  >();
  for (const n of (notifRes.data ?? []) as {
    locacao_id: string;
    criado_em: string;
    locacoes: { numero: number } | { numero: number }[] | null;
  }[]) {
    const numero = um(n.locacoes)?.numero ?? 0;
    const cur = falhasPorLoc.get(n.locacao_id);
    if (cur) cur.qtd += 1;
    else
      falhasPorLoc.set(n.locacao_id, {
        numero,
        qtd: 1,
        primeira: n.criado_em,
      });
  }
  for (const [locId, f] of falhasPorLoc) {
    acoes.push({
      id: `not-${locId}`,
      tipo: "notificacao_falha",
      texto: `${f.qtd} notificação${f.qtd === 1 ? "" : "ões"} sem entrega — ${rotuloLocacao(f.numero)}`,
      href: `/admin/locacoes/${locId}`,
      dataRefUtc: f.primeira,
    });
  }

  // (5) Sobreposições pendentes na agenda (próximos 30 dias).
  for (const s of detectarSobreposicoes(agenda30)) {
    const diaISO = utcParaNaiveSP(s.inicioUtc).slice(0, 10);
    acoes.push({
      id: `sob-${s.envolvidos.map((e) => e.agendaId).join("-")}`,
      tipo: "sobreposicao",
      texto: `Conflito de agenda em ${s.salaNome} (${diaISO.split("-").reverse().join("/")})`,
      href: `/admin/calendario?data=${diaISO}`,
      dataRefUtc: s.inicioUtc,
    });
  }

  // (6) Vagas liberadas (cancelamentos recentes) com fila aguardando.
  const cancelamentos = (cancelRes.data ?? []) as {
    locacao_id: string;
    criado_em: string;
  }[];
  if (cancelamentos.length > 0) {
    const locIds = [...new Set(cancelamentos.map((c) => c.locacao_id))];
    const quandoCancel = new Map(
      cancelamentos.map((c) => [c.locacao_id, c.criado_em]),
    );
    const [salasLocRes, locDatasRes] = await Promise.all([
      admin
        .from("locacao_salas")
        .select("locacao_id, sala_id, salas ( nome )")
        .in("locacao_id", locIds),
      admin.from("locacoes").select("id, inicio").in("id", locIds),
    ]);
    const dataDaLoc = new Map(
      ((locDatasRes.data ?? []) as { id: string; inicio: string }[]).map((l) => [
        l.id,
        utcParaNaiveSP(l.inicio).slice(0, 10),
      ]),
    );
    // Fila ativa indexada: (data → {salas concretas, temQualquerSala}).
    const filaPorData = new Map<string, { salas: Set<string>; qualquer: boolean }>();
    for (const f of (filaRes.data ?? []) as {
      sala_id: string | null;
      data: string;
    }[]) {
      const e = filaPorData.get(f.data) ?? { salas: new Set(), qualquer: false };
      if (f.sala_id) e.salas.add(f.sala_id);
      else e.qualquer = true;
      filaPorData.set(f.data, e);
    }

    const vistos = new Set<string>();
    for (const r of (salasLocRes.data ?? []) as {
      locacao_id: string;
      sala_id: string;
      salas: { nome: string } | { nome: string }[] | null;
    }[]) {
      const data = dataDaLoc.get(r.locacao_id);
      if (!data) continue;
      const fila = filaPorData.get(data);
      if (!fila || (!fila.qualquer && !fila.salas.has(r.sala_id))) continue;
      const chave = `${r.sala_id}-${data}`;
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      const salaNome = um(r.salas)?.nome ?? "sala";
      acoes.push({
        id: `vaga-${chave}`,
        tipo: "vaga_fila",
        texto: `Vaga liberada em ${salaNome} (${data.split("-").reverse().join("/")}) com fila de espera`,
        href: `/admin/lista-espera?sala=${r.sala_id}&data=${data}`,
        dataRefUtc: quandoCancel.get(r.locacao_id) ?? data,
      });
    }
  }

  acoes.sort(
    (a, b) =>
      PRIORIDADE[a.tipo] - PRIORIDADE[b.tipo] ||
      a.dataRefUtc.localeCompare(b.dataRefUtc),
  );

  // --- Cards ---------------------------------------------------------------
  const mesRows = (mesRes.data ?? []) as {
    valor_salas_centavos: number;
    valor_coffee_centavos: number;
    valor_total_centavos: number;
    status: StatusLocacao;
  }[];
  let receita = 0;
  let receitaSalas = 0;
  let receitaCoffee = 0;
  let receitaQtd = 0;
  let pipeline = 0;
  for (const r of mesRows) {
    if (RECEITA.includes(r.status)) {
      receita += r.valor_total_centavos;
      receitaSalas += r.valor_salas_centavos ?? 0;
      receitaCoffee += r.valor_coffee_centavos ?? 0;
      receitaQtd += 1;
    } else if (PIPELINE.includes(r.status)) pipeline += r.valor_total_centavos;
  }

  // --- Ocupação ------------------------------------------------------------
  const salas = (salasRes.data ?? []) as { id: string; nome: string }[];
  const comGratuito = new Set(
    ((regrasRes.data ?? []) as { sala_id: string }[]).map((r) => r.sala_id),
  );
  const diasNoMes = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const periodos = [horarios.manha, horarios.tarde, horarios.noite];

  const slots: SlotDisponivel[] = [];
  for (const s of salas) {
    for (let d = 1; d <= diasNoMes; d++) {
      const diaISO = `${ano}-${mesPad}-${String(d).padStart(2, "0")}`;
      for (const p of periodos) {
        slots.push({
          salaId: s.id,
          inicioMs: Date.parse(spWallParaUtc(diaISO, p.inicio)),
          fimMs: Date.parse(spWallParaUtc(diaISO, p.fim)),
        });
      }
    }
  }
  const ocupacoes = new Map<string, Intervalo[]>();
  // Locações distintas por sala no mês (quantas vezes a sala foi locada).
  const locacoesPorSala = new Map<string, Set<string>>();
  for (const it of agendaMes) {
    if (!it.bloqueante) continue;
    const arr = ocupacoes.get(it.salaId) ?? [];
    arr.push({ inicioMs: Date.parse(it.inicioUtc), fimMs: Date.parse(it.fimUtc) });
    ocupacoes.set(it.salaId, arr);
    if (it.origem === "locacao" && it.locacaoId) {
      const set = locacoesPorSala.get(it.salaId) ?? new Set<string>();
      set.add(it.locacaoId);
      locacoesPorSala.set(it.salaId, set);
    }
  }
  const porSala = ocupacaoPorSala(slots, ocupacoes);
  const totalOc = totalOcupacao(porSala);

  const ocupacaoSalas: OcupacaoSala[] = salas.map((s) => {
    const c = porSala.get(s.id) ?? { bloqueados: 0, total: 0 };
    return {
      salaId: s.id,
      nome: s.nome,
      bloqueados: c.bloqueados,
      total: c.total,
      pct: percentualOcupacao(c.bloqueados, c.total),
      locacoesQtd: locacoesPorSala.get(s.id)?.size ?? 0,
      temPeriodoGratuito: comGratuito.has(s.id),
    };
  });

  // --- Próximas locações da semana ----------------------------------------
  const semanaRows = (semanaRes.data ?? []) as {
    id: string;
    numero: number;
    inicio: string;
    fim: string;
    locatario_nome: string;
    status: StatusLocacao;
    locacao_salas: unknown;
  }[];
  const proximas: LocacaoResumo[] = semanaRows.slice(0, 8).map((l) => ({
    id: l.id,
    numero: l.numero,
    inicioUtc: l.inicio,
    fimUtc: l.fim,
    salas: nomesDeSalas(l.locacao_salas),
    locatario: l.locatario_nome,
    status: l.status,
  }));

  const mesRotulo = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(inicioMesUtc));

  const receitaPeriodoRotulo = receitaCustom
    ? `${diaBR(receitaDeISO)} – ${diaBR(receitaAteISO)}`
    : mesRotulo;

  return {
    acoes,
    cards: {
      pendentesAprovacao: pendentes.length,
      locacoesSemana: semanaRows.length,
      receitaMesCentavos: receita,
      receitaSalasCentavos: receitaSalas,
      receitaCoffeeCentavos: receitaCoffee,
      receitaQuantidade: receitaQtd,
      pipelineMesCentavos: pipeline,
      ocupacaoPct: percentualOcupacao(totalOc.bloqueados, totalOc.total),
      ocupacaoBloqueados: totalOc.bloqueados,
      ocupacaoDisponiveis: totalOc.total,
    },
    proximas,
    ocupacaoSalas,
    mesRotulo,
    receitaDeISO,
    receitaAteISO,
    receitaPeriodoRotulo,
  };
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
function diaBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
