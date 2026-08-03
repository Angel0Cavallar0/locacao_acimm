"use server";

import {
  exportarComissoes,
  marcarComissoesPagas,
  repararComissoes,
  type ResultadoConfig,
  type ResultadoExport,
  type ResultadoMarcar,
  type ResultadoReparo,
  salvarConfigComissoes,
} from "@/lib/comissoes/gestao";
import type {
  ConfigComissoesInput,
  FiltroVisaoComissoesInput,
  MarcarPagaComissoesInput,
} from "@/lib/validacoes/comissoes";

/** Thin layer "use server" das comissões (Ciclo 2 / Spec 29). Guards nas funções. */

export async function exportarComissoesAction(
  input: FiltroVisaoComissoesInput,
): Promise<ResultadoExport> {
  return exportarComissoes(input);
}

export async function marcarComissoesPagasAction(
  input: MarcarPagaComissoesInput,
): Promise<ResultadoMarcar> {
  return marcarComissoesPagas(input);
}

export async function repararComissoesAction(): Promise<ResultadoReparo> {
  return repararComissoes();
}

export async function salvarConfigComissoesAction(
  input: ConfigComissoesInput,
): Promise<ResultadoConfig> {
  return salvarConfigComissoes(input);
}
