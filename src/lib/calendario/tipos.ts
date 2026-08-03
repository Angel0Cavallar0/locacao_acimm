/**
 * Tipos compartilhados do calendário consolidado (Spec 05). Usados tanto na
 * server action `listarAgenda` quanto nos componentes de UI.
 */

export type OrigemOcupacao = "locacao" | "evento_interno" | "bloqueio";

export type StatusLocacao =
  | "rascunho"
  | "solicitada"
  | "em_analise"
  | "aprovada"
  | "contrato_enviado"
  | "contrato_assinado"
  | "aguardando_pagamento"
  | "confirmada"
  | "realizada"
  | "finalizada"
  | "recusada"
  | "cancelada";

export type PrioridadeEvento = "alta" | "media" | "baixa";

/** Uma ocupação da agenda, já com os dados da sua origem resolvidos. */
export interface AgendaItem {
  /** id da linha em agenda_ocupacoes. */
  id: string;
  salaId: string;
  salaNome: string;
  /** Instante UTC (ISO) — a UI converte para America/Sao_Paulo na borda. */
  inicioUtc: string;
  fimUtc: string;
  origem: OrigemOcupacao;
  /** true = ocupa de fato (última linha de defesa da disponibilidade). */
  bloqueante: boolean;
  /** Sobreposição autorizada por colaborador (Spec 31 §7): sai do índice de
   * exclusão e pode coexistir com outra bloqueante no mesmo slot. */
  sobreposicaoAutorizada?: boolean;
  /** auth.users id de quem criou a origem (locação/evento/bloqueio). */
  responsavelId: string | null;
  /** Nome do colaborador responsável, quando `responsavelId` é colaborador. */
  responsavelNome: string | null;

  // origem = 'locacao'
  locacaoId?: string | null;
  locacaoNumero?: number | null;
  locatario?: string | null;
  status?: StatusLocacao | null;
  qtdPessoas?: number | null;
  valorTotalCentavos?: number | null;

  // origem = 'evento_interno'
  eventoId?: string | null;
  eventoTitulo?: string | null;
  prioridade?: PrioridadeEvento | null;
  qtdInscritos?: number | null;
  symplaEventId?: string | null;

  // origem = 'bloqueio'
  motivo?: string | null;
}

export interface EnvolvidoSobreposicao {
  agendaId: string;
  rotulo: string;
  locacaoId: string | null;
  /** true quando é uma solicitação ainda pendente (não-bloqueante). */
  pendente: boolean;
  /** true quando é uma locação com sobreposição autorizada (Spec 31 §7). */
  autorizada: boolean;
}

/**
 * Um par de ocupações que se sobrepõem. `pendente` = envolve uma solicitação
 * ainda não aprovada (alerta a administrar). `autorizada` = duas bloqueantes
 * coexistindo por sobreposição autorizada (Spec 31 §7): conflito aceito, exibido
 * lado a lado.
 */
export interface Sobreposicao {
  salaNome: string;
  /** Janela sobreposta (interseção) em UTC. */
  inicioUtc: string;
  fimUtc: string;
  categoria: "pendente" | "autorizada";
  envolvidos: EnvolvidoSobreposicao[];
}

export interface AgendaResposta {
  eventos: AgendaItem[];
  sobreposicoes: Sobreposicao[];
}

export const STATUS_LOCACAO_ROTULO: Record<StatusLocacao, string> = {
  rascunho: "Rascunho",
  solicitada: "Solicitada",
  em_analise: "Em análise",
  aprovada: "Aprovada",
  contrato_enviado: "Contrato enviado",
  contrato_assinado: "Contrato assinado",
  aguardando_pagamento: "Aguardando pagamento",
  confirmada: "Confirmada",
  realizada: "Realizada",
  finalizada: "Finalizada",
  recusada: "Recusada",
  cancelada: "Cancelada",
};

export const PRIORIDADE_ROTULO: Record<PrioridadeEvento, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

/** Referência humana da locação (LOC-000123). */
export function rotuloLocacao(numero: number | null | undefined): string {
  return `LOC-${String(numero ?? 0).padStart(6, "0")}`;
}
