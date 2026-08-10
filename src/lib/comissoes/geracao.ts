import "server-only";
import { utcParaNaiveSP } from "@/lib/calendario/tempo";
import { createAdminClient } from "@/lib/supabase/admin";
import { reapurarCompetencia, reapurarCompetencias } from "./apuracao";
import {
  basesDevidas,
  competenciaDoMes,
  proximaCompetenciaAberta,
  valorComissao,
} from "./comissoes-core";
import {
  competenciasFechadas,
  lerConfigComissoes,
  percentualProvisorio,
} from "./dados";

/**
 * Geração e estorno de comissões (Ciclo 3 / Spec 33 §7.5). Chamado pelos hooks de
 * transição (efeitos.ts): `confirmada` gera, `cancelada` estorna. É PÓS-COMMIT e
 * best-effort — falha aqui nunca desfaz a transição (o chamador isola).
 *
 * Fato gerador = recebimento pela ACIMM. A competência é o mês do recebimento:
 * `locacoes.mes_recebimento` quando informado (decisão D), senão o mês de
 * max(baixa_em). O PERCENTUAL não é decidido aqui — é do mês inteiro, apurado por
 * `reapurarCompetencia`; o valor gravado no insert é provisório.
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
 * reprocessar não duplica (23505 é ignorado). A BASE é snapshot; o percentual e o
 * valor são reapurados enquanto a competência estiver aberta.
 */
export async function gerarComissoesConfirmada(
  locacaoId: string,
): Promise<void> {
  const admin = createAdminClient();

  const [{ data: loc }, { data: pagsRaw }, cfg, fechadas] = await Promise.all([
    admin
      .from("locacoes")
      .select(
        "valor_salas_centavos, valor_descontos_centavos, valor_adicionais_centavos, valor_coffee_centavos, valor_total_centavos, mes_recebimento",
      )
      .eq("id", locacaoId)
      .maybeSingle(),
    admin
      .from("pagamentos")
      .select("id, status, forma, baixa_em")
      .eq("locacao_id", locacaoId)
      .neq("status", "estornado"),
    lerConfigComissoes(),
    competenciasFechadas(),
  ]);

  if (!loc) return;

  const pags = (pagsRaw ?? []) as PagamentoLite[];
  const pagos = pags.filter((p) => p.status === "pago");
  const totalCentavos = (loc.valor_total_centavos as number) ?? 0;

  // Fato gerador = recebimento. Isenção total (valor 0 ou tudo isento, nada
  // recebido) NÃO gera comissão — decisão intencional (Spec 29 §4.1, mantida).
  const ehIsencaoTotal =
    totalCentavos === 0 ||
    (pagos.length === 0 &&
      pags.length > 0 &&
      pags.every((p) => p.status === "isento"));
  if (ehIsencaoTotal) return;

  const bases = basesDevidas(cfg, {
    valorSalasCentavos: (loc.valor_salas_centavos as number) ?? 0,
    valorDescontosCentavos: (loc.valor_descontos_centavos as number) ?? 0,
    valorAdicionaisCentavos: (loc.valor_adicionais_centavos as number) ?? 0,
    valorCoffeeCentavos: (loc.valor_coffee_centavos as number) ?? 0,
  });
  if (bases.length === 0) return;

  const baixas = pagos
    .map((p) => p.baixa_em)
    .filter((d): d is string => Boolean(d))
    .sort();
  const recebidoEm = baixas.length > 0 ? baixas[baixas.length - 1] : null;

  // Competência desejada: o mês INFORMADO manda (decisão D); senão o mês da
  // quitação (max baixa_em); senão o mês corrente (confirmação manual/offline).
  const mesInformado = (loc.mes_recebimento as string | null) ?? null;
  const desejada = mesInformado
    ? String(mesInformado).slice(0, 10)
    : competenciaDoMes(recebidoEm ? mesSP(recebidoEm) : mesCorrenteSP());

  // Competência fechada pode já ter sido paga ao colaborador: lança na próxima
  // aberta e guarda o mês real em `competencia_original` (Spec 33 §7.3).
  const competencia = proximaCompetenciaAberta(desejada, fechadas);
  const deslocada = competencia !== desejada;

  // Torna a sugestão visível e editável no detalhe da locação.
  if (!mesInformado) {
    await admin
      .from("locacoes")
      .update({ mes_recebimento: desejada })
      .eq("id", locacaoId)
      .is("mes_recebimento", null);
  }

  const formaPagamento =
    pagos.length === 1 ? pagos[0].forma : pagos.length > 1 ? "multiplas" : null;
  const pagamentoId = pagos.length === 1 ? pagos[0].id : null;

  // Percentual provisório considerando o que já existe na competência — assim o
  // valor gravado já é o certo mesmo se a reapuração abaixo falhar.
  const pct = await percentualProvisorio(competencia, cfg, {
    locacaoCentavos:
      bases.find((b) => b.origem === "locacao")?.baseCentavos ?? 0,
    coffeeCentavos: bases.find((b) => b.origem === "coffee")?.baseCentavos ?? 0,
  });

  // Insere por origem para que uma já existente (23505) não derrube a outra.
  for (const base of bases) {
    const percentual = base.origem === "locacao" ? pct.locacao : pct.coffee;
    const { error } = await admin.from("comissoes").insert({
      locacao_id: locacaoId,
      origem: base.origem,
      base_centavos: base.baseCentavos,
      percentual,
      valor_centavos: valorComissao(base.baseCentavos, percentual),
      competencia,
      competencia_original: deslocada ? desejada : null,
      recebido_em: recebidoEm,
      forma_pagamento: formaPagamento,
      pagamento_id: pagamentoId,
    });
    if (error && error.code !== "23505") {
      console.error(
        `[comissoes] falha ao gerar ${base.origem} da locação ${locacaoId}:`,
        error.message,
      );
    }
  }

  // Reapura o mês inteiro: a entrada desta locação pode ter cruzado a faixa e
  // mudado o percentual de TODAS as linhas da competência.
  try {
    await reapurarCompetencia(competencia, { cfg });
  } catch (e) {
    console.error(
      `[comissoes] reapuração pós-geração falhou em ${competencia}:`,
      e,
    );
  }
}

/**
 * Estorna as comissões vivas de uma locação (cancelamento pós-confirmada). Sem
 * hard delete: carimba `estornada_em`. Não reverte comissões já pagas ao
 * colaborador nem linhas em competência FECHADA — nos dois casos o valor já foi
 * congelado/quitado, e a correção é ajuste manual (aviso interno).
 */
export async function estornarComissoesLocacao(
  locacaoId: string,
): Promise<void> {
  const admin = createAdminClient();

  const [{ data: vivas }, fechadas] = await Promise.all([
    admin
      .from("comissoes")
      .select("id, pago, competencia")
      .eq("locacao_id", locacaoId)
      .is("estornada_em", null),
    competenciasFechadas(),
  ]);

  const linhas = (vivas ?? []) as {
    id: string;
    pago: boolean;
    competencia: string;
  }[];
  if (linhas.length === 0) return;

  const travadas = new Set(fechadas);
  const estornaveis = linhas.filter(
    (l) => !l.pago && !travadas.has(String(l.competencia).slice(0, 10)),
  );
  const mantidas = linhas.length - estornaveis.length;

  if (estornaveis.length > 0) {
    const { error } = await admin
      .from("comissoes")
      .update({ estornada_em: new Date().toISOString() })
      .in(
        "id",
        estornaveis.map((l) => l.id),
      )
      .is("estornada_em", null)
      .eq("pago", false);
    if (error) {
      console.error(
        `[comissoes] falha ao estornar comissões da locação ${locacaoId}:`,
        error.message,
      );
      return;
    }

    await reapurarCompetencias(
      estornaveis.map((l) => String(l.competencia).slice(0, 10)),
    );
  }

  if (mantidas > 0) {
    const { notificarComissaoEstornada } = await import(
      "@/lib/notificacoes/eventos"
    );
    await notificarComissaoEstornada(locacaoId, mantidas);
  }
}
