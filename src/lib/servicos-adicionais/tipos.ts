/**
 * Tipos e rótulos do catálogo de serviços adicionais (Ciclo 2 / Spec 30 §2).
 * Puros (sem I/O) — compartilhados server + client.
 */

export type ModeloCobranca = "por_unidade" | "fixo_evento" | "sob_consulta";

export const MODELOS_COBRANCA: { valor: ModeloCobranca; rotulo: string }[] = [
  { valor: "por_unidade", rotulo: "Por unidade" },
  { valor: "fixo_evento", rotulo: "Fixo por evento" },
  { valor: "sob_consulta", rotulo: "Sob consulta" },
];

export const MODELO_COBRANCA_ROTULO: Record<ModeloCobranca, string> = {
  por_unidade: "Por unidade",
  fixo_evento: "Fixo por evento",
  sob_consulta: "Sob consulta",
};

/** Sugestões de unidade (campo livre — não é enum no banco). */
export const UNIDADES_SUGERIDAS = [
  "certificado",
  "montagem",
  "cadeira",
  "publicacao",
  "evento",
  "locacao",
  "unidade",
  "hora",
];

export interface ServicoAdicional {
  id: string;
  nome: string;
  descricao: string | null;
  modeloCobranca: ModeloCobranca;
  unidade: string | null;
  valorUnitarioCentavos: number | null;
  salaId: string | null;
  salaNome: string | null;
  requerAprovacao: boolean;
  sujeitoDisponibilidade: boolean;
  ativo: boolean;
}
