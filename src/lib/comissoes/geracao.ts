import "server-only";
import { utcParaNaiveSP } from "@/lib/calendario/tempo";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  comissoesDevidas,
  competenciaDoMes,
  parsearConfigComissoes,
} from "./comissoes-core";

/**
 * Geração e estorno de comissões (Ciclo 2 / Spec 29 §4). Chamado pelos hooks de
 * transição (efeitos.ts): `confirmada` gera, `cancelada` estorna. É PÓS-COMMIT e
 * best-effort — falha aqui nunca desfaz a transição (o chamador isola).
 *
 * Fato gerador = recebimento pela ACIMM. A transição `confirmada` só é alcançável
 * de `aguardando_pagamento` e é disparada exatamente na quitação total, então
 * gerar aqui equivale a "gerar no recebimento". A competência é o mês da
 * quitação (max `baixa_em`), não mais o mês do evento.
 */

/** Mês 'YYYY-MM' de um instante UTC no fuso de São Paulo. */
function mesSP(instanteUtc: string): string {
  return utcParaNaiveSP(instanteUtc).slice(0, 7);
}

/** Mês corrente 'YYYY-MM' em SP (fallback de competência). */
function mesCorrenteSP(): string {
  return utcParaNaiveSP(new Date().toISOString()).slice(0, 7);
}

interface PagamentoLite {
  id: string;
  status: string;
  forma: string;
  baixa_em: string | null;
}

/**
 * Gera as comissões devidas para uma locação recém-confirmada. Idempotente pelo
 * índice único parcial `(locacao_id, origem) where estornada_em is null`:
 * reprocessar não duplica (23505 é ignorado). Base/percentual/recebimento são
 * snapshot — mudar a config depois NÃO recalcula comissões existentes.
 */
export async function gerarComissoesConfirmada(
  locacaoId: string,
): Promise<void> {
  const admin = createAdminClient();

  const [{ data: cfgRow }, { data: loc }, { data: pagsRaw }] =
    await Promise.all([
      admin
        .from("configuracoes")
        .select("valor")
        .eq("chave", "comissoes")
        .maybeSingle(),
      admin
        .from("locacoes")
        .select(
          "valor_salas_centavos, valor_descontos_centavos, valor_adicionais_centavos, valor_coffee_centavos, valor_total_centavos",
        )
        .eq("id", locacaoId)
        .maybeSingle(),
      admin
        .from("pagamentos")
        .select("id, status, forma, baixa_em")
        .eq("locacao_id", locacaoId)
        .neq("status", "estornado"),
    ]);

  if (!loc) return;

  const pags = (pagsRaw ?? []) as PagamentoLite[];
  const pagos = pags.filter((p) => p.status === "pago");
  const totalCentavos = (loc.valor_total_centavos as number) ?? 0;

  // Fato gerador = recebimento. Isenção total (valor 0 ou tudo isento, nada
  // recebido) NÃO gera comissão — decisão intencional (Spec 29 §4.1).
  const ehIsencaoTotal =
    totalCentavos === 0 ||
    (pagos.length === 0 &&
      pags.length > 0 &&
      pags.every((p) => p.status === "isento"));
  if (ehIsencaoTotal) return;

  const cfg = parsearConfigComissoes(cfgRow?.valor);
  const linhas = comissoesDevidas(cfg, {
    valorSalasCentavos: (loc.valor_salas_centavos as number) ?? 0,
    valorDescontosCentavos: (loc.valor_descontos_centavos as number) ?? 0,
    valorAdicionaisCentavos: (loc.valor_adicionais_centavos as number) ?? 0,
    valorCoffeeCentavos: (loc.valor_coffee_centavos as number) ?? 0,
  });
  if (linhas.length === 0) return;

  // Competência = mês da quitação (max baixa_em). Fallback no mês corrente quando
  // confirmada sem baixa registrada (confirmação manual / pagamento offline).
  const baixas = pagos
    .map((p) => p.baixa_em)
    .filter((d): d is string => Boolean(d))
    .sort();
  const recebidoEm = baixas.length > 0 ? baixas[baixas.length - 1] : null;
  const competencia = competenciaDoMes(
    recebidoEm ? mesSP(recebidoEm) : mesCorrenteSP(),
  );
  const formaPagamento =
    pagos.length === 1 ? pagos[0].forma : pagos.length > 1 ? "multiplas" : null;
  const pagamentoId = pagos.length === 1 ? pagos[0].id : null;

  // Insere por origem para que uma já existente (23505) não derrube a outra.
  for (const linha of linhas) {
    const { error } = await admin.from("comissoes").insert({
      locacao_id: locacaoId,
      origem: linha.origem,
      base_centavos: linha.baseCentavos,
      percentual: linha.percentual,
      valor_centavos: linha.valorCentavos,
      competencia,
      recebido_em: recebidoEm,
      forma_pagamento: formaPagamento,
      pagamento_id: pagamentoId,
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
 * hard delete: carimba `estornada_em`. Ciclo 2 (§4.2): só reverte comissões NÃO
 * pagas ao colaborador; as já `pago` permanecem (não existe estorno após
 * pagamento) e disparam aviso interno de ajuste manual. No-op quando não há
 * comissão (locação nunca confirmada).
 */
export async function estornarComissoesLocacao(
  locacaoId: string,
): Promise<void> {
  const admin = createAdminClient();

  const { data: vivas } = await admin
    .from("comissoes")
    .select("id, pago")
    .eq("locacao_id", locacaoId)
    .is("estornada_em", null);

  const linhas = (vivas ?? []) as { id: string; pago: boolean }[];
  if (linhas.length === 0) return;

  const { error } = await admin
    .from("comissoes")
    .update({ estornada_em: new Date().toISOString() })
    .eq("locacao_id", locacaoId)
    .is("estornada_em", null)
    .eq("pago", false);
  if (error) {
    console.error(
      `[comissoes] falha ao estornar comissões da locação ${locacaoId}:`,
      error.message,
    );
    return;
  }

  const jaPagas = linhas.filter((l) => l.pago).length;
  if (jaPagas > 0) {
    const { notificarComissaoEstornada } = await import(
      "@/lib/notificacoes/eventos"
    );
    await notificarComissaoEstornada(locacaoId, jaPagas);
  }
}
