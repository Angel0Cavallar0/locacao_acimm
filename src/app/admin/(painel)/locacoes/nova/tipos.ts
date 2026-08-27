import type { CondicaoLocatario, PeriodoDia } from "@/lib/dominio";
import type { ComboInfo } from "@/lib/locacoes/calcular";
import type { FormaPagamento } from "@/lib/locacoes/tipos";

/** Tipos compartilhados server ↔ client do fluxo de criação assistida (Spec 07). */

export interface AssociadoBusca {
  id: string;
  nome: string;
  razaoSocial: string | null;
  documento: string | null;
  emails: string[];
  telefone: string | null;
  situacao: "ativo" | "suspenso" | "excluido";
  /** Código do associado no Sophus (Spec 32 §3.1) — usado na busca de boletos. */
  codigoSophus: number | null;
}

export type EstadoDisponibilidade =
  | "livre"
  | "solicitado"
  | "ocupado"
  | "evento_acimm"
  | "bloqueio";

export interface DisponibilidadeSala {
  salaId: string;
  estado: EstadoDisponibilidade;
  ocupante?: string;
}

export interface PeriodoGratuitoResumo {
  salaId: string;
  salaNome: string;
  ciclo: string; // 'YYYY-MM-01'
  elegivel: boolean;
  aplicado: boolean;
  usoAtual: number;
  limite: number;
  motivo?: string;
}

export interface ResumoValores {
  salas: {
    salaId: string;
    nome: string;
    valorCentavos: number;
    semPreco: boolean;
    /** Valor que resolverPreco() calcularia — null = sem preço de referência (Spec 34). */
    referenciaCentavos: number | null;
  }[];
  salasSemPreco: string[];
  salasCentavos: number;
  coffeeCentavos: number;
  adicionaisCentavos: number;
  descontosCentavos: number;
  descontos: { rotulo: string; valorCentavos: number }[];
  periodoGratuito: PeriodoGratuitoResumo | null;
  combo: ComboInfo | null;
  totalCentavos: number;
  /** Aviso de antecedência (§A) — no assistido informa, não bloqueia. */
  aviso?: string | null;
}

export interface CoffeePayload {
  nivelId: string;
  qtdPessoas: number;
  horarioServir: string | null; // 'HH:mm'
  adicionais: { descricao: string; valorCentavos: number }[];
  observacoes: string;
}

export interface AdicionalPayload {
  descricao: string;
  quantidade: number;
  valorUnitarioCentavos: number;
  /** Item do catálogo (Ciclo 2/Spec 30); null = texto livre. */
  servicoAdicionalId?: string | null;
}

export interface CriarLocacaoPayload {
  condicao: CondicaoLocatario;
  associadoId: string | null;
  locatarioNome: string;
  locatarioDocumento: string;
  locatarioEmail: string;
  locatarioTelefone: string;
  responsavelNome: string;
  salaIds: string[];
  data: string;
  periodo: PeriodoDia;
  horaInicio: string;
  horaFim: string;
  qtdPessoas: number;
  tipoEvento: string;
  observacoes: string;
  respostasFormulario: Record<string, unknown>;
  coffee: CoffeePayload | null;
  adicionais: AdicionalPayload[];
  formaPagamento: FormaPagamento | null;
  aprovar: boolean;
  /** Conversão a partir da lista de espera (Spec 19 §4). */
  filaEsperaId?: string | null;
  /** Conversão a partir de uma pendência sem data. */
  pendenciaId?: string | null;
  /** Conversão a partir de uma cotação. */
  cotacaoId?: string | null;
  /** Sócio recusou o período gratuito nesta reserva (Spec 20 §5.3). */
  periodoGratuitoRecusado?: boolean;
  /** Combo selecionado (Spec 20 §3). */
  comboId?: string | null;
  /** Colaborador confirmou a sobreposição no pop-up (Spec 31 §7). */
  sobreposicaoAutorizada?: boolean;
  /** Lançamento retroativo — evento passado, sem automações (Spec 31 §6). */
  retroativa?: boolean;
  /** Resultado do evento retroativo — só relevante quando `retroativa`. */
  retroativaResultado?: "concluido" | "cancelado";
  /** Situação do pagamento retroativo — só relevante quando `retroativa`. */
  retroativaPagamento?: "pago" | "pendente";
  /** Preferência de canal de notificação ao locatário nesta locação. */
  notificarWhatsapp?: boolean;
  notificarEmail?: boolean;
  /** Valor final por sala confirmado/sobrescrito pelo colaborador (Spec 34). */
  valoresManuaisPorSala: Record<string, number>;
  /** Desconto manual — percentual ou valor fixo em centavos (Spec 34). */
  descontoManual?: { tipo: "percentual" | "valor"; valor: number; motivo?: string } | null;
}

/** Ocupante bloqueante que o colaborador precisa confirmar sobrepor (Spec 31 §7). */
export interface ConflitoSobreposicao {
  salaNome: string;
  ocupante: string;
}
