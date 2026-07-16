/**
 * Templates de mensagens transacionais (CLAUDE.md §6.5).
 * Texto sempre em pt-BR; JAMAIS mencionar FacioFlow/stack (§1).
 * Stub — os templates reais entram na Fase 4.
 */

export interface DadosLocacao {
  nomeLocatario: string;
  nomeSala: string;
  data: string;
  horario: string;
}

export const templates = {
  solicitacaoRecebida(d: DadosLocacao): string {
    return `Olá, ${d.nomeLocatario}! Recebemos sua solicitação de locação da ${d.nomeSala} para ${d.data} (${d.horario}). Ela está em análise e avisaremos assim que houver retorno.`;
  },
} as const;
