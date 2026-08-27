"use server";

import {
  adicionarPendencia,
  arquivarPendencia,
  restaurarPendencia,
  type ResultadoPendencia,
} from "@/lib/pendencias/gestao";

/** Thin layer "use server" das pendências sem data. Guards nas funções. */

export async function adicionarPendenciaAction(input: {
  associadoId: string | null;
  nome: string;
  contato: string;
  motivo?: string;
  observacoes?: string;
}): Promise<ResultadoPendencia> {
  return adicionarPendencia(input);
}

export async function arquivarPendenciaAction(input: {
  id: string;
  motivo?: string;
}): Promise<ResultadoPendencia> {
  return arquivarPendencia(input);
}

export async function restaurarPendenciaAction(
  id: string,
): Promise<ResultadoPendencia> {
  return restaurarPendencia(id);
}
