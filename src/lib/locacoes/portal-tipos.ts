import type { StatusLocacao } from "./maquina-estados-core";
import type { FormaPagamento } from "./tipos";

/** Tipos do portal do associado (Spec 12), compartilhados server ↔ client. */

export type TabLocacoes = "andamento" | "realizadas" | "encerradas" | "todas";

export interface CardLocacao {
  id: string;
  numero: number;
  status: StatusLocacao;
  inicioUtc: string;
  fimUtc: string;
  valorTotalCentavos: number;
  salas: string[];
}

/** Autor da linha do tempo, sem revelar nome de colaborador (§3.1). */
export type AutorTipo = "voce" | "acimm" | "sistema";

export interface EventoPortal {
  id: string;
  de: StatusLocacao | null;
  para: StatusLocacao;
  criadoEmUtc: string;
  autorTipo: AutorTipo;
  /** Rótulo já sanitizado (whitelist) — nunca a `observacao` bruta do evento. */
  rotulo: string;
  /** Só para recusada/cancelada, vindo de `locacoes.motivo_encerramento`. */
  motivo: string | null;
}

export interface SalaDetalhePortal {
  nome: string;
  valorCentavos: number;
  fotos: string[];
}

export interface AdicionalPortal {
  descricao: string;
  quantidade: number;
  valorUnitarioCentavos: number;
}

export interface CoffeePortal {
  nivelNome: string;
  qtdPessoas: number;
  horarioServirUtc: string | null;
  valorCentavos: number;
}

export interface ContratoPortal {
  status: string;
  linkAssinatura: string | null;
  temPdf: boolean;
  assinadoEmUtc: string | null;
  /** O associado já enviou o contrato assinado (aguardando conferência). */
  assinadoEnviado: boolean;
}

export interface PagamentoPortal {
  id: string;
  descricao: string;
  forma: FormaPagamento;
  valorCentavos: number;
  status: string;
  temComprovante: boolean;
  /** Quando pago, o instante da baixa (para exibir "Pago em …"). */
  baixaEmUtc: string | null;
}

export interface LocacaoPortalDetalhe {
  id: string;
  numero: number;
  status: StatusLocacao;
  inicioUtc: string;
  fimUtc: string;
  qtdPessoas: number;
  tipoEvento: string | null;
  observacoes: string | null;
  respostasFormulario: Record<string, unknown>;
  formaPagamento: FormaPagamento | null; // inclui "transferencia" (Spec 13)
  motivoEncerramento: string | null;
  valorSalasCentavos: number;
  valorCoffeeCentavos: number;
  valorAdicionaisCentavos: number;
  valorDescontosCentavos: number;
  valorTotalCentavos: number;
  combo: { nome: string; tipo: string } | null;
  podeCancelar: boolean;
  salas: SalaDetalhePortal[];
  adicionais: AdicionalPortal[];
  coffee: CoffeePortal | null;
  contrato: ContratoPortal | null;
  pagamentos: PagamentoPortal[];
  eventos: EventoPortal[];
}
