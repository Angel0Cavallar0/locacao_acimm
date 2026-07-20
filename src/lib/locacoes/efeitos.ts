import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StatusLocacao } from "./maquina-estados-core";

/**
 * Hooks de efeitos pós-transição (Spec 06 §2.3). São PÓS-COMMIT: rodam depois
 * que a transição já foi gravada, então uma falha aqui NUNCA desfaz a
 * transição — só é registrada para retry (Spec 15).
 *
 * Neste spec todos são no-op com log. Specs futuros apenas registram funções
 * neste mapa, sem tocar na máquina de estados:
 *  - `solicitada`→ confirmação de recebimento ao associado (15) — Spec 11
 *  - `aprovada`  → contrato/Autentique (13), notificação (15), Google Calendar (18)
 *  - `confirmada`→ notificação final + convite de agenda (15/18)
 *  - `recusada`/`cancelada` → notificar com motivo (15) + atualizar Calendar (18)
 */

export interface ContextoEfeito {
  locacaoId: string;
  /** `null` quando a locação nasce (criação direta em `solicitada`). */
  de: StatusLocacao | null;
  para: StatusLocacao;
  autorUserId: string | null;
  motivo?: string;
}

export type EfeitoFn = (ctx: ContextoEfeito) => Promise<void>;

function logar(nome: string): EfeitoFn {
  return (ctx) => {
    console.info(
      `[efeito:${nome}] locacao=${ctx.locacaoId} ${ctx.de ?? "novo"}→${ctx.para}`,
    );
    return Promise.resolve();
  };
}

/**
 * Contrato (Spec 13). Import DINÂMICO para quebrar o ciclo estático
 * efeitos → contratos/efeito → contratos/enviar → maquina-estados → efeitos.
 */
const gerarEEnviarContrato: EfeitoFn = async (ctx) => {
  const { processarContratoAprovada } = await import("@/lib/contratos/efeito");
  await processarContratoAprovada(ctx);
};

/**
 * Pagamentos (Spec 14). Import DINÂMICO pelo mesmo motivo do contrato:
 * efeitos → pagamentos/efeito → pagamentos/gestao → maquina-estados → efeitos.
 */
const criarPagamentos: EfeitoFn = async (ctx) => {
  const { processarAguardandoPagamento } = await import(
    "@/lib/pagamentos/efeito"
  );
  await processarAguardandoPagamento(ctx);
};

/**
 * Ao marcar a locação como assinada (colaborador aprovou o assinado enviado
 * pelo associado), reflete no `contratos.status` para o portal mostrar
 * "Assinado" (revisão Spec 13).
 */
const sincronizarContratoAssinado: EfeitoFn = async (ctx) => {
  const admin = createAdminClient();
  await admin
    .from("contratos")
    .update({ status: "assinado", assinado_em: new Date().toISOString() })
    .eq("locacao_id", ctx.locacaoId);
};

export const efeitosPosTransicao: Partial<Record<StatusLocacao, EfeitoFn[]>> = {
  solicitada: [logar("solicitada")],
  aprovada: [logar("aprovada"), gerarEEnviarContrato],
  contrato_assinado: [logar("contrato_assinado"), sincronizarContratoAssinado],
  aguardando_pagamento: [logar("aguardando_pagamento"), criarPagamentos],
  confirmada: [logar("confirmada")],
  recusada: [logar("recusada")],
  cancelada: [logar("cancelada")],
};

/** Executa os efeitos do estado destino; isola falhas (não propaga). */
export async function dispararEfeitos(ctx: ContextoEfeito): Promise<void> {
  for (const fn of efeitosPosTransicao[ctx.para] ?? []) {
    try {
      await fn(ctx);
    } catch (e) {
      console.error(
        `[efeito] falha em ${ctx.para} (locacao ${ctx.locacaoId}):`,
        e,
      );
    }
  }
}
