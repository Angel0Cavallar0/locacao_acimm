"use server";

import {
  exportarComissoes,
  type ResultadoConfig,
  type ResultadoExport,
  salvarConfigComissoes,
} from "@/lib/comissoes/gestao";
import type { ConfigComissoesInput } from "@/lib/validacoes/comissoes";

/** Thin layer "use server" das comissões (Spec 21). Guards nas funções. */

export async function exportarComissoesAction(input: {
  competencia: string | null;
  origem: "locacao" | "coffee" | null;
  status:
    | "pendentes"
    | "exportadas"
    | "estornadas"
    | "estornadas_exportadas"
    | null;
  busca: string | null;
}): Promise<ResultadoExport> {
  return exportarComissoes(input);
}

export async function salvarConfigComissoesAction(
  input: ConfigComissoesInput,
): Promise<ResultadoConfig> {
  return salvarConfigComissoes(input);
}
