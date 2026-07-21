import type { PeriodoDia } from "@/lib/dominio";

/** Tipos da disponibilidade do portal (Spec 10), compartilhados server + client. */

export type EstadoPeriodo =
  | "livre"
  | "solicitado"
  | "ocupado"
  | "evento_acimm"
  | "sem_preco"
  /** Dentro do prazo mínimo de antecedência da sala (Melhorias §A). */
  | "antecedencia";

/** Ocupação materializada em ms (entrada da lógica pura de estado). */
export interface OcupacaoSlot {
  inicioMs: number;
  fimMs: number;
  situacao: "solicitado" | "ocupado" | "evento_acimm";
  eventoTitulo: string | null;
  eventoSymplaId: string | null;
  eventoSymplaUrl: string | null;
}

export interface ChipPeriodo {
  periodo: PeriodoDia;
  rotulo: string;
  faixa: { inicio: string; fim: string };
  estado: EstadoPeriodo;
  /** Só quando `livre` e associado ativo; senão null. */
  precoCentavos: number | null;
  eventoTitulo: string | null;
  eventoSymplaId: string | null;
  /** Link público do evento Sympla (quando vinculado) — CTA "participar". */
  eventoSymplaUrl: string | null;
  /** Sócio elegível com saldo de período gratuito nesta sala/período (§5.4). */
  gratuitoDisponivel: boolean;
}

export interface SalaDisponibilidade {
  id: string;
  nome: string;
  descricao: string | null;
  capacidade: number;
  equipamentos: string[];
  capaUrl: string | null;
  /** Todas as fotos da sala (URLs) — usadas no detalhe da sala. */
  fotos: string[];
  chips: ChipPeriodo[];
  /** Antecedência mínima da sala em dias (0 = sem restrição — Melhorias §A). */
  diasAntecedenciaMinima: number;
}

export interface ContatoAcimm {
  telefone: string;
  whatsapp: string;
  email: string;
}

export interface DisponibilidadeDia {
  data: string;
  /** Associado ativo pode solicitar/entrar na fila e ver preços. */
  podeSolicitar: boolean;
  salas: SalaDisponibilidade[];
  contato: ContatoAcimm;
}
