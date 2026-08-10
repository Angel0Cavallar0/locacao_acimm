"use server";

import {
  fecharCompetencia,
  reabrirCompetencia,
  recalcularCompetencia,
} from "@/lib/comissoes/apuracao";
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
  CompetenciaInput,
  ConfigComissoesInput,
  FiltroVisaoComissoesInput,
  MarcarPagaComissoesInput,
} from "@/lib/validacoes/comissoes";

/** Thin layer "use server" das comissões (Ciclo 3 / Spec 33). Guards nas funções. */

export type ResultadoCompetencia = { ok: true } | { erro: string };

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

export async function recalcularCompetenciaAction(
  input: CompetenciaInput,
): Promise<ResultadoCompetencia> {
  return recalcularCompetencia(input);
}

export async function fecharCompetenciaAction(
  input: CompetenciaInput,
): Promise<ResultadoCompetencia> {
  return fecharCompetencia(input);
}

export async function reabrirCompetenciaAction(
  input: CompetenciaInput,
): Promise<ResultadoCompetencia> {
  return reabrirCompetencia(input);
}
