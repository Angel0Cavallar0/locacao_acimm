import "server-only";
import { proximoDiaISO, spWallParaUtc } from "@/lib/calendario/tempo";
import { PERIODOS, type PeriodoDia } from "@/lib/dominio";
import { respeitaAntecedencia } from "@/lib/disponibilidade/janela";
import { obterHorariosPeriodos } from "@/lib/locacoes/horarios";
import { salasComGratuitoDisponivel } from "@/lib/periodo-gratuito/consumo";
import { resolverPreco } from "@/lib/precos/resolver";
import { createAdminClient } from "@/lib/supabase/admin";
import { urlFotoSala } from "@/lib/storage";
import { estadoDoSlot } from "./estado-core";
import type {
  ChipPeriodo,
  ContatoAcimm,
  DisponibilidadeDia,
  OcupacaoSlot,
  SalaDisponibilidade,
} from "./tipos";

function msSP(data: string, hora: string): number {
  return Date.parse(spWallParaUtc(data, hora));
}

export interface SalaFiltro {
  id: string;
  nome: string;
  capacidade: number;
}

/** Todas as salas ativas — alimenta o filtro (independe da seleção atual). */
export async function listarSalasAtivas(): Promise<SalaFiltro[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("salas")
    .select("id, nome, capacidade")
    .eq("ativa", true)
    .is("excluida_em", null)
    .order("ordem", { ascending: true })
    .order("criado_em", { ascending: true });
  return (data ?? []).map((s) => ({
    id: s.id as string,
    nome: s.nome as string,
    capacidade: s.capacidade as number,
  }));
}

export interface EntradaDisponibilidade {
  data: string;
  salaIds: string[] | null;
  capacidadeMin: number | null;
  /** Situação do associado logado — só `ativo` vê preço e pode solicitar. */
  situacao: "ativo" | "suspenso" | "excluido";
  /** Id do associado — habilita o selo "Gratuito disponível" (§5.4). */
  associadoId?: string | null;
}

export async function listarDisponibilidade(
  input: EntradaDisponibilidade,
): Promise<DisponibilidadeDia> {
  const admin = createAdminClient();
  const podeSolicitar = input.situacao === "ativo";

  // Salas ativas (filtro de capacidade e de seleção).
  let q = admin
    .from("salas")
    .select(
      "id, nome, descricao, capacidade, equipamentos, fotos, dias_antecedencia_minima",
    )
    .eq("ativa", true)
    .is("excluida_em", null)
    .order("ordem", { ascending: true })
    .order("criado_em", { ascending: true });
  if (input.capacidadeMin && input.capacidadeMin > 0) {
    q = q.gte("capacidade", input.capacidadeMin);
  }
  if (input.salaIds && input.salaIds.length > 0) {
    q = q.in("id", input.salaIds);
  }
  const { data: salasRows } = await q;
  const salas = salasRows ?? [];

  const [horarios, contato] = await Promise.all([
    obterHorariosPeriodos(),
    carregarContato(admin),
  ]);

  if (salas.length === 0) {
    return { data: input.data, podeSolicitar, salas: [], contato };
  }

  // Ocupações do dia (view disponibilidade via RPC — nunca agenda_ocupacoes).
  const inicioUtc = spWallParaUtc(input.data, "00:00");
  const fimUtc = spWallParaUtc(proximoDiaISO(input.data), "00:00");
  const { data: ocupRows } = await admin.rpc("disponibilidade_no_dia", {
    p_inicio: inicioUtc,
    p_fim: fimUtc,
    p_sala_ids: salas.map((s) => s.id),
  });

  const ocupPorSala = new Map<string, OcupacaoSlot[]>();
  for (const r of (ocupRows ?? []) as Array<{
    sala_id: string;
    inicio: string;
    fim: string;
    situacao: OcupacaoSlot["situacao"];
    evento_titulo: string | null;
    evento_sympla_id: string | null;
    evento_sympla_url: string | null;
  }>) {
    const lista = ocupPorSala.get(r.sala_id) ?? [];
    lista.push({
      inicioMs: Date.parse(r.inicio),
      fimMs: Date.parse(r.fim),
      situacao: r.situacao,
      eventoTitulo: r.evento_titulo,
      eventoSymplaId: r.evento_sympla_id,
      eventoSymplaUrl: r.evento_sympla_url,
    });
    ocupPorSala.set(r.sala_id, lista);
  }

  // Ranges de conflito por período. Dia inteiro = união de manhã+tarde+noite.
  const subInicios = [horarios.manha.inicio, horarios.tarde.inicio, horarios.noite.inicio];
  const subFins = [horarios.manha.fim, horarios.tarde.fim, horarios.noite.fim];
  const diaInteiroInicio = subInicios.reduce((a, b) => (a < b ? a : b));
  const diaInteiroFim = subFins.reduce((a, b) => (a > b ? a : b));

  function conflitoRange(periodo: PeriodoDia): { inicioMs: number; fimMs: number } {
    if (periodo === "dia_inteiro") {
      return {
        inicioMs: msSP(input.data, diaInteiroInicio),
        fimMs: msSP(input.data, diaInteiroFim),
      };
    }
    const f = horarios[periodo];
    return { inicioMs: msSP(input.data, f.inicio), fimMs: msSP(input.data, f.fim) };
  }

  // Meio-dia SP garante data/dia-da-semana corretos para o preço.
  const dataEvento = new Date(spWallParaUtc(input.data, "12:00"));

  // Período gratuito (§5.4): regra ativa por sala × períodos + saldo do sócio.
  const gratuitoRegras = new Map<string, Set<string>>();
  let gratuitoSaldo = new Set<string>();
  if (podeSolicitar && input.associadoId) {
    const [{ data: regras }, saldo] = await Promise.all([
      admin
        .from("regras_periodo_gratuito")
        .select("sala_id, periodos")
        .eq("ativo", true),
      salasComGratuitoDisponivel(input.associadoId),
    ]);
    for (const r of (regras ?? []) as {
      sala_id: string;
      periodos: string[];
    }[]) {
      gratuitoRegras.set(r.sala_id, new Set(r.periodos));
    }
    gratuitoSaldo = saldo;
  }

  const resultado: SalaDisponibilidade[] = [];
  for (const s of salas) {
    const fotos = ((s.fotos as string[] | null) ?? []).map(urlFotoSala);
    const ocupacoes = ocupPorSala.get(s.id) ?? [];
    const chips: ChipPeriodo[] = [];

    // Antecedência mínima da sala (§A): dentro do prazo, o slot livre vira
    // "antecedencia" (não aparece disponível no calendário).
    const minDias = (s.dias_antecedencia_minima as number | null) ?? 0;
    const dentroDoPrazo = !respeitaAntecedencia(input.data, minDias);

    for (const p of PERIODOS) {
      const faixa = horarios[p.valor];
      const { estado, eventoTitulo, eventoSymplaId, eventoSymplaUrl } =
        estadoDoSlot(conflitoRange(p.valor), ocupacoes);

      let estadoFinal = estado as ChipPeriodo["estado"];
      let precoCentavos: number | null = null;

      if (estadoFinal === "livre" && dentroDoPrazo) {
        estadoFinal = "antecedencia";
      }

      if (estadoFinal === "livre" && podeSolicitar) {
        const preco = await resolverPreco({
          salaId: s.id,
          data: dataEvento,
          periodo: p.valor,
          condicao: "associado",
        });
        if ("valorCentavos" in preco) {
          precoCentavos = preco.valorCentavos;
        } else {
          estadoFinal = "sem_preco";
        }
      }

      const gratuitoDisponivel =
        estadoFinal === "livre" &&
        (gratuitoRegras.get(s.id)?.has(p.valor) ?? false) &&
        gratuitoSaldo.has(s.id);

      chips.push({
        periodo: p.valor,
        rotulo: p.rotulo,
        faixa,
        estado: estadoFinal,
        precoCentavos,
        eventoTitulo,
        eventoSymplaId,
        eventoSymplaUrl,
        gratuitoDisponivel,
      });
    }

    resultado.push({
      id: s.id,
      nome: s.nome,
      descricao: (s.descricao as string) ?? null,
      capacidade: s.capacidade,
      equipamentos: (s.equipamentos as string[] | null) ?? [],
      capaUrl: fotos[0] ?? null,
      fotos,
      chips,
      diasAntecedenciaMinima: minDias,
    });
  }

  return { data: input.data, podeSolicitar, salas: resultado, contato };
}

async function carregarContato(
  admin: ReturnType<typeof createAdminClient>,
): Promise<ContatoAcimm> {
  const { data } = await admin
    .from("configuracoes")
    .select("valor")
    .eq("chave", "contato_acimm")
    .maybeSingle();
  const v = (data?.valor ?? {}) as Partial<ContatoAcimm>;
  return {
    telefone: v.telefone ?? "",
    whatsapp: v.whatsapp ?? "",
    email: v.email ?? "",
  };
}
