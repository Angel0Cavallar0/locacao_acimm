import "server-only";
import { type ResultadoValidacao, validarRespostas } from "./campos-core";
import { camposAtivos } from "./dados";

/**
 * Validação dinâmica das respostas no submit (Spec 22 §4) — reforço aos Specs
 * 07/11. Monta as regras a partir dos campos ATIVOS no momento do submit
 * (estado ATUAL), então uma edição concorrente resulta em erro amigável, nunca
 * em dado inconsistente. Chaves desconhecidas/inativas são descartadas.
 *
 * Usada tanto pela solicitação do associado quanto pelo atendimento assistido.
 */
export async function validarRespostasFormulario(
  brutas: Record<string, unknown>,
): Promise<ResultadoValidacao> {
  const campos = await camposAtivos();
  return validarRespostas(campos, brutas);
}
