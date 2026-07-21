"use server";

import {
  adicionarEntradaFila,
  arquivarEntradaFila,
  restaurarEntradaFila,
  type ResultadoFila,
} from "@/lib/lista-espera/gestao";

/** Thin layer "use server" da lista de espera (Spec 19). Guards nas funções. */

export async function adicionarFilaAction(input: {
  salaId: string | null;
  data: string;
  associadoId: string | null;
  nome: string;
  contato: string;
  observacoes?: string;
}): Promise<ResultadoFila> {
  return adicionarEntradaFila(input);
}

export async function arquivarFilaAction(input: {
  id: string;
  motivo?: string;
}): Promise<ResultadoFila> {
  return arquivarEntradaFila(input);
}

export async function restaurarFilaAction(id: string): Promise<ResultadoFila> {
  return restaurarEntradaFila(id);
}
