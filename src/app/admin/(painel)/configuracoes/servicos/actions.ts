"use server";

import {
  alternarAtivoServico,
  criarServico,
  editarServico,
  excluirServico,
  type ResultadoServico,
} from "@/lib/servicos-adicionais/gestao";
import type { ServicoAdicionalInput } from "@/lib/validacoes/servicos-adicionais";

/** Thin layer "use server" do catálogo de serviços adicionais (Spec 30 §2.3). */

export async function criarServicoAction(
  input: ServicoAdicionalInput,
): Promise<ResultadoServico> {
  return criarServico(input);
}

export async function editarServicoAction(
  id: string,
  input: ServicoAdicionalInput,
): Promise<ResultadoServico> {
  return editarServico(id, input);
}

export async function alternarAtivoServicoAction(
  id: string,
  ativo: boolean,
): Promise<ResultadoServico> {
  return alternarAtivoServico(id, ativo);
}

export async function excluirServicoAction(
  id: string,
): Promise<ResultadoServico> {
  return excluirServico(id);
}
