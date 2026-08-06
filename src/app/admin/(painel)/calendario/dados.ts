import "server-only";
import { detectarSobreposicoes } from "@/lib/calendario/sobreposicoes";
import type {
  AgendaItem,
  AgendaResposta,
  OrigemOcupacao,
  PrioridadeEvento,
  StatusLocacao,
} from "@/lib/calendario/tipos";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Camada de dados do calendário — compartilhada pelo Server Component (carga
 * inicial) e pela server action `listarAgenda` (navegação de range). Fica fora
 * do arquivo "use server" porque não é, ela própria, uma action.
 */

interface LinhaRpc {
  id: string;
  sala_id: string;
  sala_nome: string;
  inicio: string;
  fim: string;
  origem: OrigemOcupacao;
  bloqueante: boolean;
  motivo: string | null;
  responsavel_id: string | null;
  locacao_id: string | null;
  locacao_numero: number | null;
  locatario: string | null;
  status: StatusLocacao | null;
  qtd_pessoas: number | null;
  valor_total_centavos: number | null;
  evento_id: string | null;
  evento_titulo: string | null;
  prioridade: PrioridadeEvento | null;
  qtd_inscritos: number | null;
  sympla_event_id: string | null;
  sobreposicao_autorizada: boolean | null;
  coffee_horario_servir: string | null;
}

export async function carregarAgenda(
  inicioUtc: string,
  fimUtc: string,
): Promise<AgendaResposta> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("agenda_no_intervalo", {
    p_inicio: inicioUtc,
    p_fim: fimUtc,
  });
  if (error || !data) return { eventos: [], sobreposicoes: [] };

  const linhas = data as LinhaRpc[];

  // Resolve os nomes dos responsáveis (quando são colaboradores) num só lookup.
  const ids = [
    ...new Set(
      linhas
        .map((l) => l.responsavel_id)
        .filter((x): x is string => x !== null),
    ),
  ];
  const nomes = new Map<string, string>();
  if (ids.length > 0) {
    const { data: colabs } = await admin
      .from("colaboradores")
      .select("user_id, nome")
      .in("user_id", ids);
    for (const c of colabs ?? []) {
      nomes.set(c.user_id as string, c.nome as string);
    }
  }

  const eventos: AgendaItem[] = linhas.map((l) => ({
    id: l.id,
    salaId: l.sala_id,
    salaNome: l.sala_nome,
    inicioUtc: l.inicio,
    fimUtc: l.fim,
    origem: l.origem,
    bloqueante: l.bloqueante,
    sobreposicaoAutorizada: l.sobreposicao_autorizada ?? false,
    responsavelId: l.responsavel_id,
    responsavelNome: l.responsavel_id
      ? (nomes.get(l.responsavel_id) ?? null)
      : null,
    locacaoId: l.locacao_id,
    locacaoNumero: l.locacao_numero,
    locatario: l.locatario,
    status: l.status,
    qtdPessoas: l.qtd_pessoas,
    valorTotalCentavos: l.valor_total_centavos,
    eventoId: l.evento_id,
    eventoTitulo: l.evento_titulo,
    prioridade: l.prioridade,
    qtdInscritos: l.qtd_inscritos,
    symplaEventId: l.sympla_event_id,
    coffeeHorarioServirUtc: l.coffee_horario_servir,
    motivo: l.motivo,
  }));

  return { eventos, sobreposicoes: detectarSobreposicoes(eventos) };
}
