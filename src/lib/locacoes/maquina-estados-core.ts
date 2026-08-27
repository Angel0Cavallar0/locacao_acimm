/**
 * Máquina de estados de locações — lógica PURA (Spec 06 §2). Sem I/O, espelha
 * o mapa de transições que a transição server-side (`transicionarLocacao`)
 * valida antes do compare-and-swap no banco. Fonte única do que é permitido.
 */

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

/** Transições permitidas (§2.1). Estados sem saída são terminais. */
export const TRANSICOES: Record<StatusLocacao, StatusLocacao[]> = {
  rascunho: ["solicitada", "cancelada"],
  solicitada: ["em_analise", "aprovada", "recusada", "cancelada"],
  em_analise: ["aprovada", "recusada", "cancelada"],
  aprovada: ["contrato_enviado", "cancelada"],
  contrato_enviado: ["contrato_assinado", "cancelada"],
  contrato_assinado: ["aguardando_pagamento", "cancelada"],
  aguardando_pagamento: ["confirmada", "cancelada"],
  confirmada: ["realizada", "cancelada"],
  realizada: ["finalizada"],
  finalizada: [],
  recusada: [],
  cancelada: [],
};

/** Transições que exigem `motivo` (gravado em motivo_encerramento). */
const EXIGEM_MOTIVO: StatusLocacao[] = ["recusada", "cancelada"];

export function transicaoPermitida(
  de: StatusLocacao,
  para: StatusLocacao,
): boolean {
  return TRANSICOES[de]?.includes(para) ?? false;
}

export function ehTerminal(status: StatusLocacao): boolean {
  return TRANSICOES[status].length === 0;
}

export function exigeMotivo(para: StatusLocacao): boolean {
  return EXIGEM_MOTIVO.includes(para);
}

/** Reagendamento permitido só antes de o contrato ser enviado (§2.5). */
export function podeReagendar(status: StatusLocacao): boolean {
  return (
    status === "solicitada" ||
    status === "em_analise" ||
    status === "aprovada"
  );
}

/** Adicionais editáveis enquanto status ≤ aprovada (§4). */
export function podeEditarAdicionais(status: StatusLocacao): boolean {
  return podeReagendar(status);
}

const STATUS_MOSTRA_PAGAMENTO_PENDENTE = new Set<StatusLocacao>([
  "confirmada",
  "realizada",
  "finalizada",
]);

/**
 * Mostra o aviso de "pagamento pendente" fora de `aguardando_pagamento` (o
 * próprio status já comunica isso ali — mostrar de novo seria redundante).
 */
export function mostraPagamentoPendente(status: StatusLocacao): boolean {
  return STATUS_MOSTRA_PAGAMENTO_PENDENTE.has(status);
}

export const STATUS_ROTULO: Record<StatusLocacao, string> = {
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

export type GrupoStatus =
  | "rascunho"
  | "pendente"
  | "andamento"
  | "concluida"
  | "encerrada";

export function grupoStatus(status: StatusLocacao): GrupoStatus {
  if (status === "rascunho") return "rascunho";
  if (status === "solicitada" || status === "em_analise") return "pendente";
  if (status === "realizada" || status === "finalizada") return "concluida";
  if (status === "recusada" || status === "cancelada") return "encerrada";
  return "andamento";
}

export type TipoAcao = "normal" | "aprovar" | "motivo" | "confirmar_pendencia";
export type VarianteAcao = "default" | "outline" | "destructive";

export interface AcaoTransicao {
  para: StatusLocacao;
  rotulo: string;
  tipo: TipoAcao;
  variante: VarianteAcao;
}

/**
 * Ações contextuais oferecidas na UI por status (§4). É um subconjunto de
 * TRANSICOES: cancelar é permitido desde `solicitada`, mas só é oferecido a
 * partir de `aprovada` (antes disso o "não" adequado é Recusar).
 */
export const ACOES_POR_STATUS: Record<StatusLocacao, AcaoTransicao[]> = {
  rascunho: [],
  solicitada: [
    { para: "em_analise", rotulo: "Analisar", tipo: "normal", variante: "outline" },
    { para: "aprovada", rotulo: "Aprovar", tipo: "aprovar", variante: "default" },
    { para: "recusada", rotulo: "Recusar", tipo: "motivo", variante: "destructive" },
  ],
  em_analise: [
    { para: "aprovada", rotulo: "Aprovar", tipo: "aprovar", variante: "default" },
    { para: "recusada", rotulo: "Recusar", tipo: "motivo", variante: "destructive" },
  ],
  aprovada: [
    { para: "contrato_enviado", rotulo: "Marcar contrato enviado", tipo: "normal", variante: "default" },
    { para: "cancelada", rotulo: "Cancelar", tipo: "motivo", variante: "outline" },
  ],
  contrato_enviado: [
    { para: "contrato_assinado", rotulo: "Marcar contrato assinado", tipo: "normal", variante: "default" },
    { para: "cancelada", rotulo: "Cancelar", tipo: "motivo", variante: "outline" },
  ],
  contrato_assinado: [
    { para: "aguardando_pagamento", rotulo: "Enviar p/ pagamento", tipo: "normal", variante: "default" },
    { para: "cancelada", rotulo: "Cancelar", tipo: "motivo", variante: "outline" },
  ],
  aguardando_pagamento: [
    { para: "confirmada", rotulo: "Confirmar locação", tipo: "confirmar_pendencia", variante: "default" },
    { para: "cancelada", rotulo: "Cancelar", tipo: "motivo", variante: "outline" },
  ],
  confirmada: [
    { para: "realizada", rotulo: "Marcar realizada", tipo: "normal", variante: "default" },
    { para: "cancelada", rotulo: "Cancelar", tipo: "motivo", variante: "outline" },
  ],
  realizada: [
    { para: "finalizada", rotulo: "Finalizar", tipo: "normal", variante: "default" },
  ],
  finalizada: [],
  recusada: [],
  cancelada: [],
};
