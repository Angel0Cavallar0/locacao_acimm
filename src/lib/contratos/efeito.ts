import "server-only";
import type { ContextoEfeito } from "@/lib/locacoes/efeitos";
import { enviarContrato } from "./enviar";
import { gerarContrato } from "./gerar";

/**
 * Efeito pós-aprovação (Spec 13 §3): gera o contrato e encadeia o envio
 * conforme o modo configurado. É POST-COMMIT e isolado — qualquer falha aqui
 * NÃO desfaz a aprovação; o detalhe mostra o erro + "Gerar novamente".
 * Autor Sistema (null) — geração/envio automáticos.
 */
export async function processarContratoAprovada(
  ctx: ContextoEfeito,
): Promise<void> {
  const g = await gerarContrato(ctx.locacaoId, null);
  if (g.error) {
    console.error(
      `[contrato:aprovada] geração falhou (locacao ${ctx.locacaoId}): ${g.error}`,
    );
    return;
  }
  const e = await enviarContrato(ctx.locacaoId, null, {
    pdfBuffer: g.pdfBuffer,
  });
  if (e.error) {
    console.error(
      `[contrato:aprovada] envio falhou (locacao ${ctx.locacaoId}): ${e.error}`,
    );
  } else if (e.aviso) {
    console.info(`[contrato:aprovada] ${e.aviso} (locacao ${ctx.locacaoId})`);
  }
}
