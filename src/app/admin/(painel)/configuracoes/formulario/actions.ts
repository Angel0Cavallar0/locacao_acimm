"use server";

import { requireColaborador } from "@/lib/auth/guards";
import { opcoesEmUso } from "@/lib/formulario/dados";
import {
  alternarAtivoCampo,
  criarCampo,
  editarCampo,
  reordenarCampo,
  type ResultadoCampo,
} from "@/lib/formulario/gestao";

/** Thin layer "use server" do editor de formulário (Spec 22). Guards nas funções. */

export async function criarCampoAction(input: {
  rotulo: string;
  tipo: string;
  opcoes: string[];
  obrigatorio: boolean;
  ativo: boolean;
}): Promise<ResultadoCampo> {
  return criarCampo(input);
}

export async function editarCampoAction(input: {
  id: string;
  rotulo: string;
  opcoes: string[];
  obrigatorio: boolean;
  ativo: boolean;
}): Promise<ResultadoCampo> {
  return editarCampo(input);
}

export async function alternarAtivoCampoAction(input: {
  id: string;
  ativo: boolean;
}): Promise<ResultadoCampo> {
  return alternarAtivoCampo(input);
}

export async function reordenarCampoAction(input: {
  id: string;
  direcao: "cima" | "baixo";
}): Promise<ResultadoCampo> {
  return reordenarCampo(input);
}

/** Opções em uso (para o aviso ao remover — §3). */
export async function opcoesEmUsoAction(campoId: string): Promise<string[]> {
  await requireColaborador();
  return opcoesEmUso(campoId);
}
