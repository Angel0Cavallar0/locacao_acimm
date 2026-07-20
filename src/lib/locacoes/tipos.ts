import type { AdicionalCoffee } from "@/lib/coffee/tipos";
import type { CondicaoLocatario, PeriodoDia } from "@/lib/dominio";
import type { StatusLocacao } from "./maquina-estados-core";

/** Tipos e rótulos de domínio de locações, compartilhados server + client. */

export type FormaPagamento =
  | "pix"
  | "transferencia"
  | "boleto_avulso"
  | "boleto_mensalidade"
  | "isento";

export const FORMAS_PAGAMENTO: { valor: FormaPagamento; rotulo: string }[] = [
  { valor: "pix", rotulo: "Pix" },
  { valor: "transferencia", rotulo: "Transferência bancária" },
  { valor: "boleto_avulso", rotulo: "Boleto avulso" },
  { valor: "boleto_mensalidade", rotulo: "Boleto - Mensalidade" },
  { valor: "isento", rotulo: "Isento" },
];

export const FORMA_PAGAMENTO_ROTULO: Record<FormaPagamento, string> = {
  pix: "Pix",
  transferencia: "Transferência bancária",
  boleto_avulso: "Boleto avulso",
  boleto_mensalidade: "Boleto - Mensalidade",
  isento: "Isento",
};

/** Referência humana da locação (LOC-000123). */
export function rotuloLocacao(numero: number): string {
  return `LOC-${String(numero).padStart(6, "0")}`;
}

/** Formata CPF (11) ou CNPJ (14); devolve o original se não bater. */
export function formatarDocumento(doc: string): string {
  const d = doc.replace(/\D/g, "");
  if (d.length === 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }
  if (d.length === 14) {
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  }
  return doc;
}

/** Linha da lista de locações (`/admin/locacoes`). */
export interface LocacaoLista {
  id: string;
  numero: number;
  condicao: CondicaoLocatario;
  locatario: string;
  inicioUtc: string;
  fimUtc: string;
  status: StatusLocacao;
  valorTotalCentavos: number;
  formaPagamento: FormaPagamento | null;
  criadoEmUtc: string;
  salas: string[];
}

export interface SalaLinha {
  salaId: string;
  nome: string;
  valorCentavos: number;
}

export interface AdicionalLinha {
  id: string;
  descricao: string;
  quantidade: number;
  valorUnitarioCentavos: number;
}

export interface EventoTimeline {
  id: string;
  de: StatusLocacao | null;
  para: StatusLocacao;
  autorNome: string | null;
  observacao: string | null;
  dados: unknown;
  criadoEmUtc: string;
}

export interface CoffeeLinha {
  id: string;
  nivelId: string;
  nivelNome: string;
  qtdPessoas: number;
  valorCentavos: number;
  horarioServirUtc: string | null;
  adicionais: AdicionalCoffee[];
  observacoes: string | null;
}

export interface ContratoResumo {
  status: string;
  linkAssinatura: string | null;
  pdfUrl: string | null;
  enviadoEmUtc: string | null;
  assinadoEmUtc: string | null;
}

export interface PagamentoLinha {
  id: string;
  descricao: string;
  forma: FormaPagamento;
  valorCentavos: number;
  status: string;
  comprovanteUrl: string | null;
}

/** Detalhe completo da locação (`/admin/locacoes/[id]`). */
export interface LocacaoDetalhe {
  id: string;
  numero: number;
  status: StatusLocacao;
  condicao: CondicaoLocatario;
  periodo: PeriodoDia | null;
  inicioUtc: string;
  fimUtc: string;
  qtdPessoas: number;
  tipoEvento: string | null;
  observacoes: string | null;
  respostasFormulario: Record<string, unknown>;
  locatarioNome: string;
  locatarioDocumento: string;
  locatarioEmail: string;
  locatarioTelefone: string;
  responsavelNome: string | null;
  associadoId: string | null;
  associadoNome: string | null;
  formaPagamento: FormaPagamento | null;
  motivoEncerramento: string | null;
  criadoPorNome: string | null;
  criadoEmUtc: string;
  valorSalasCentavos: number;
  valorCoffeeCentavos: number;
  valorAdicionaisCentavos: number;
  valorDescontosCentavos: number;
  valorTotalCentavos: number;
  periodoGratuitoAplicado: boolean;
  salas: SalaLinha[];
  adicionais: AdicionalLinha[];
  eventos: EventoTimeline[];
  coffee: CoffeeLinha[];
  contrato: ContratoResumo | null;
  pagamentos: PagamentoLinha[];
}
