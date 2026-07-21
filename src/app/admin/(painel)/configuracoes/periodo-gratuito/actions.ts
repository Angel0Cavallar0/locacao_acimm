"use server";

import { criarRegra, editarRegra, type ResultadoRegra } from "@/lib/periodo-gratuito/regras";

/** Actions do CRUD de regras de período gratuito (Spec 20 §5.1). Guards em regras.ts. */

export async function criarRegraAction(input: {
  salaId: string;
  periodos: string[];
  usosPorCiclo: number;
}): Promise<ResultadoRegra> {
  return criarRegra(input);
}

export async function editarRegraAction(input: {
  id: string;
  periodos: string[];
  usosPorCiclo: number;
  ativo: boolean;
}): Promise<ResultadoRegra> {
  return editarRegra(input);
}
