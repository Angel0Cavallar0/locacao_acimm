import type { StatusLocacao } from "@/lib/locacoes/maquina-estados-core";

/** Tipos compartilhados do dashboard (Spec 23). */

export type TipoAcao =
  | "solicitacao"
  | "comprovante"
  | "contrato_recusado"
  | "notificacao_falha"
  | "sobreposicao"
  | "vaga_fila";

export interface AcaoNecessaria {
  id: string;
  tipo: TipoAcao;
  texto: string;
  /** null = sem alvo direto (raro; ex.: notificação interna). */
  href: string | null;
  /** ISO UTC — ordena "mais antigo primeiro" dentro do tipo. */
  dataRefUtc: string;
}

export interface CardsIndicadores {
  pendentesAprovacao: number;
  locacoesSemana: number;
  receitaMesCentavos: number;
  /** Pipeline do mês (aprovada→aguardando_pagamento): não é receita ainda. */
  pipelineMesCentavos: number;
  ocupacaoPct: number;
  ocupacaoBloqueados: number;
  ocupacaoDisponiveis: number;
}

export interface LocacaoResumo {
  id: string;
  numero: number;
  inicioUtc: string;
  fimUtc: string;
  salas: string[];
  locatario: string;
  status: StatusLocacao;
}

export interface OcupacaoSala {
  salaId: string;
  nome: string;
  bloqueados: number;
  total: number;
  pct: number;
  /** Sala com regra de período gratuito ativa (marcador discreto — §5). */
  temPeriodoGratuito: boolean;
}

export interface DashboardData {
  acoes: AcaoNecessaria[];
  cards: CardsIndicadores;
  proximas: LocacaoResumo[];
  ocupacaoSalas: OcupacaoSala[];
  /** "julho de 2026" — subtítulo dos indicadores. */
  mesRotulo: string;
}
