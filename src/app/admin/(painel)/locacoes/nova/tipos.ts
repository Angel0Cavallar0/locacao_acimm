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
  salas: { salaId: string; nome: string; valorCentavos: number; semPreco: boolean }[];
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
  /** Sócio recusou o período gratuito nesta reserva (Spec 20 §5.3). */
  periodoGratuitoRecusado?: boolean;
  /** Combo selecionado (Spec 20 §3). */
  comboId?: string | null;
}
