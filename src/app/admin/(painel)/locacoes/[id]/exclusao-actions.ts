"use server";

import {
  excluirLocacaoDefinitivamente,
  type ResultadoExclusao,
} from "@/lib/locacoes/exclusao";

/** Ação dedicada à exclusão definitiva — guard (`requireAdmin`) na função. */
export async function excluirLocacaoAction(input: {
  locacaoId: string;
  motivo: string;
}): Promise<ResultadoExclusao> {
  return excluirLocacaoDefinitivamente(input);
}
