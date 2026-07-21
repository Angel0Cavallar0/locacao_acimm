import "server-only";
import { utcParaNaiveSP } from "@/lib/calendario/tempo";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  comissoesDevidas,
  parsearConfigComissoes,
} from "./comissoes-core";

/**
 * Geração e estorno de comissões (Spec 21 §3/§4). Chamado pelos hooks de
 * transição (efeitos.ts): `confirmada` gera, `cancelada` estorna. É PÓS-COMMIT
 * e best-effort — falha aqui nunca desfaz a transição (o chamador isola).
 */

/** Competência = 1º dia do mês do evento (São Paulo), 'YYYY-MM-01'. */
function competenciaDoEvento(inicioUtc: string): string {
  return `${utcParaNaiveSP(inicioUtc).slice(0, 7)}-01`;
}

/**
 * Gera as comissões devidas para uma locação recém-confirmada. Idempotente pelo
 * índice único parcial `(locacao_id, origem) where estornada_em is null`:
 * reprocessar não duplica (23505 é ignorado). Base e percentual são snapshot.
 */
export async function gerarComissoesConfirmada(
  locacaoId: string,
): Promise<void> {
  const admin = createAdminClient();

  const [{ data: cfgRow }, { data: loc }] = await Promise.all([
    admin
      .from("configuracoes")
      .select("valor")
      .eq("chave", "comissoes")
      .maybeSingle(),
    admin
      .from("locacoes")
      .select(
        "inicio, valor_salas_centavos, valor_descontos_centavos, valor_adicionais_centavos, valor_coffee_centavos",
      )
      .eq("id", locacaoId)
      .maybeSingle(),
  ]);

  if (!loc) return;

  const cfg = parsearConfigComissoes(cfgRow?.valor);
  const linhas = comissoesDevidas(cfg, {
    valorSalasCentavos: (loc.valor_salas_centavos as number) ?? 0,
    valorDescontosCentavos: (loc.valor_descontos_centavos as number) ?? 0,
    valorAdicionaisCentavos: (loc.valor_adicionais_centavos as number) ?? 0,
    valorCoffeeCentavos: (loc.valor_coffee_centavos as number) ?? 0,
  });
  if (linhas.length === 0) return;

  const competencia = competenciaDoEvento(loc.inicio as string);

  // Insere por origem para que uma já existente (23505) não derrube a outra.
  for (const linha of linhas) {
    const { error } = await admin.from("comissoes").insert({
      locacao_id: locacaoId,
      origem: linha.origem,
      base_centavos: linha.baseCentavos,
      percentual: linha.percentual,
      valor_centavos: linha.valorCentavos,
      competencia,
    });
    if (error && error.code !== "23505") {
      console.error(
        `[comissoes] falha ao gerar ${linha.origem} da locação ${locacaoId}:`,
        error.message,
      );
    }
  }
}

/**
 * Estorna as comissões vivas de uma locação (cancelamento pós-confirmada). Sem
 * hard delete: carimba `estornada_em` (histórico + badge). Se alguma já havia
 * sido exportada, dispara aviso interno (§4) — é ajuste que a ACIMM lança de
 * volta no controle dela. No-op quando não há comissão (nunca confirmada).
 */
export async function estornarComissoesLocacao(
  locacaoId: string,
): Promise<void> {
  const admin = createAdminClient();

  const { data: vivas } = await admin
    .from("comissoes")
    .select("id, exportada")
    .eq("locacao_id", locacaoId)
    .is("estornada_em", null);

  const linhas = (vivas ?? []) as { id: string; exportada: boolean }[];
  if (linhas.length === 0) return;

  const { error } = await admin
    .from("comissoes")
    .update({ estornada_em: new Date().toISOString() })
    .eq("locacao_id", locacaoId)
    .is("estornada_em", null);
  if (error) {
    console.error(
      `[comissoes] falha ao estornar comissões da locação ${locacaoId}:`,
      error.message,
    );
    return;
  }

  const exportadas = linhas.filter((l) => l.exportada).length;
  if (exportadas > 0) {
    const { notificarComissaoEstornada } = await import(
      "@/lib/notificacoes/eventos"
    );
    await notificarComissaoEstornada(locacaoId, exportadas);
  }
}
