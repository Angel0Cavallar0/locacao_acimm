/** Tipos de domínio espelhando os enums do banco (Spec 02 §4). */

export type PeriodoDia = "manha" | "tarde" | "noite" | "dia_inteiro";
export type CondicaoLocatario = "associado" | "nao_associado";

export const PERIODOS: { valor: PeriodoDia; rotulo: string }[] = [
  { valor: "manha", rotulo: "Manhã" },
  { valor: "tarde", rotulo: "Tarde" },
  { valor: "noite", rotulo: "Noite" },
  { valor: "dia_inteiro", rotulo: "Dia inteiro" },
];

export const CONDICOES: { valor: CondicaoLocatario; rotulo: string }[] = [
  { valor: "associado", rotulo: "Associado" },
  { valor: "nao_associado", rotulo: "Não associado" },
];

/** 0 = domingo … 6 = sábado. */
export const DIAS_SEMANA: { valor: number; curto: string; rotulo: string }[] = [
  { valor: 0, curto: "Dom", rotulo: "Domingo" },
  { valor: 1, curto: "Seg", rotulo: "Segunda" },
  { valor: 2, curto: "Ter", rotulo: "Terça" },
  { valor: 3, curto: "Qua", rotulo: "Quarta" },
  { valor: 4, curto: "Qui", rotulo: "Quinta" },
  { valor: 5, curto: "Sex", rotulo: "Sexta" },
  { valor: 6, curto: "Sáb", rotulo: "Sábado" },
];
