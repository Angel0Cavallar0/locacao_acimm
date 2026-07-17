import "server-only";
import type { StatusLocacao } from "./maquina-estados-core";

/**
 * Hooks de efeitos pós-transição (Spec 06 §2.3). São PÓS-COMMIT: rodam depois
 * que a transição já foi gravada, então uma falha aqui NUNCA desfaz a
 * transição — só é registrada para retry (Spec 15).
 *
 * Neste spec todos são no-op com log. Specs futuros apenas registram funções
 * neste mapa, sem tocar na máquina de estados:
 *  - `aprovada`  → contrato/Autentique (13), notificação (15), Google Calendar (18)
 *  - `confirmada`→ notificação final + convite de agenda (15/18)
 *  - `recusada`/`cancelada` → notificar com motivo (15) + atualizar Calendar (18)
 */

export interface ContextoEfeito {
  locacaoId: string;
  de: StatusLocacao;
  para: StatusLocacao;
  autorUserId: string | null;
  motivo?: string;
}

export type EfeitoFn = (ctx: ContextoEfeito) => Promise<void>;

function logar(nome: string): EfeitoFn {
  return (ctx) => {
    console.info(
      `[efeito:${nome}] locacao=${ctx.locacaoId} ${ctx.de}→${ctx.para}`,
    );
    return Promise.resolve();
  };
}

export const efeitosPosTransicao: Partial<Record<StatusLocacao, EfeitoFn[]>> = {
  aprovada: [logar("aprovada")],
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
