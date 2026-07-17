import type { CondicaoLocatario, PeriodoDia } from "@/lib/dominio";
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

export interface ResumoValores {
  salas: { salaId: string; nome: string; valorCentavos: number; semPreco: boolean }[];
  salasSemPreco: string[];
  salasCentavos: number;
  coffeeCentavos: number;
  adicionaisCentavos: number;
  descontosCentavos: number;
  totalCentavos: number;
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
}

export interface CriarLocacaoPayload {
  condicao: CondicaoLocatario;
  associadoId: string | null;
  locatarioNome: string;
  locatarioDocumento: string;
  locatarioEmail: string;
  locatarioTelefone: string;
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
}
