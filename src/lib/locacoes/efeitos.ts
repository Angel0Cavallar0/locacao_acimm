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
 * Notificações WhatsApp + e-mail (Spec 15). Import DINÂMICO: mantém `after()`
 * (next/server) e o stack de canais fora do grafo estático da transição.
 */
const notif = {
  solicitada: (async (ctx) => {
    const { notificarSolicitada } = await import("@/lib/notificacoes/eventos");
    await notificarSolicitada(ctx.locacaoId);
  }) as EfeitoFn,
  aprovada: (async (ctx) => {
    const { notificarAprovada } = await import("@/lib/notificacoes/eventos");
    await notificarAprovada(ctx.locacaoId);
  }) as EfeitoFn,
  contratoEnviado: (async (ctx) => {
    const { notificarContratoEnviado } = await import(
      "@/lib/notificacoes/eventos"
    );
    await notificarContratoEnviado(ctx.locacaoId);
  }) as EfeitoFn,
  recusada: (async (ctx) => {
    const { notificarRecusada } = await import("@/lib/notificacoes/eventos");
    await notificarRecusada(ctx.locacaoId, ctx.motivo);
  }) as EfeitoFn,
  confirmada: (async (ctx) => {
    const { notificarConfirmada } = await import("@/lib/notificacoes/eventos");
    await notificarConfirmada(ctx.locacaoId);
  }) as EfeitoFn,
  cancelada: (async (ctx) => {
    const { notificarCancelada } = await import("@/lib/notificacoes/eventos");
    await notificarCancelada(ctx.locacaoId, ctx.autorUserId, ctx.motivo);
  }) as EfeitoFn,
};

/**
 * Espelho Google Calendar (Spec 18). Import DINÂMICO: só MARCA a pendência e
 * dispara a reconciliação via `after()` — nenhuma chamada ao Google no caminho
 * da transição. O reconciliador decide create/patch/delete pelo status atual.
 */
const marcarGoogle: EfeitoFn = async (ctx) => {
  const { marcarLocacaoPendente } = await import("@/lib/google/marcar");
  await marcarLocacaoPendente(ctx.locacaoId);
};

/**
 * Vaga liberada (Spec 19 §6): quando uma locação que era BLOQUEANTE na agenda
 * cai (recusa/cancelamento), avisa a fila de espera da(s) sala(s)/data. Só o
 * estado anterior importa — `solicitada`/`em_analise` não bloqueavam ninguém.
 */
const BLOQUEANTES: StatusLocacao[] = [
  "aprovada",
  "contrato_enviado",
  "contrato_assinado",
  "aguardando_pagamento",
  "confirmada",
  "realizada",
];
const liberarVaga: EfeitoFn = async (ctx) => {
  if (!ctx.de || !BLOQUEANTES.includes(ctx.de)) return;

  // Spec 31 §7: com sobreposição autorizada, o slot pode CONTINUAR ocupado por
  // outra bloqueante — só avisa a fila se a vaga abriu de fato. Neste ponto a
  // agenda desta locação já foi removida (rebuild em recusada/cancelada).
  const admin = createAdminClient();
  const { data: loc } = await admin
    .from("locacoes")
    .select("inicio, fim")
    .eq("id", ctx.locacaoId)
    .maybeSingle();
  if (loc?.inicio && loc?.fim) {
    const { data: ls } = await admin
      .from("locacao_salas")
      .select("sala_id")
      .eq("locacao_id", ctx.locacaoId);
    const salaIds = new Set((ls ?? []).map((r) => r.sala_id as string));
    const { data: itens } = await admin.rpc("agenda_no_intervalo", {
      p_inicio: loc.inicio as string,
      p_fim: loc.fim as string,
    });
    type OcupItem = {
      sala_id: string;
      bloqueante: boolean;
      locacao_id: string | null;
    };
    const aindaOcupado = ((itens ?? []) as OcupItem[]).some(
      (i) =>
        salaIds.has(i.sala_id) &&
        i.bloqueante &&
        i.locacao_id !== ctx.locacaoId,
    );
    if (aindaOcupado) return;
  }

  const { notificarVagasLocacao } = await import("@/lib/notificacoes/eventos");
  await notificarVagasLocacao(ctx.locacaoId);
};

/**
 * Devolve o uso do período gratuito (Spec 20 §5.3) quando a locação é
 * recusada/cancelada — libera o benefício para outra data do ciclo.
 */
const devolverGratuito: EfeitoFn = async (ctx) => {
  const { devolverPeriodoGratuito } = await import(
    "@/lib/periodo-gratuito/consumo"
  );
  await devolverPeriodoGratuito(ctx.locacaoId);
};

/**
 * Comissões (Spec 21). Import DINÂMICO (mesmo motivo dos demais efeitos):
 * `confirmada` gera as comissões devidas; `cancelada` estorna as vivas. Ambos
 * idempotentes/no-op quando não há o que fazer.
 */
const gerarComissoes: EfeitoFn = async (ctx) => {
  const { gerarComissoesConfirmada } = await import("@/lib/comissoes/geracao");
  await gerarComissoesConfirmada(ctx.locacaoId);
};
const estornarComissoes: EfeitoFn = async (ctx) => {
  const { estornarComissoesLocacao } = await import("@/lib/comissoes/geracao");
  await estornarComissoesLocacao(ctx.locacaoId);
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

/**
 * Efeitos EXTERNOS suprimidos em lançamentos retroativos (Spec 31 §6.3): o
 * evento já ocorreu, então nada de mensagem ao associado, contrato, instruções
 * de pagamento ou espelho no Google. A comissão (gerarComissoes) e a auditoria
 * são MANTIDAS — é o objetivo do lançamento.
 */
const SUPRIMIVEIS_RETROATIVA = new Set<EfeitoFn>([
  notif.solicitada,
  notif.aprovada,
  notif.contratoEnviado,
  notif.recusada,
  notif.confirmada,
  notif.cancelada,
  marcarGoogle,
  gerarEEnviarContrato,
  criarPagamentos,
]);

export const efeitosPosTransicao: Partial<Record<StatusLocacao, EfeitoFn[]>> = {
  solicitada: [logar("solicitada"), notif.solicitada],
  aprovada: [logar("aprovada"), notif.aprovada, gerarEEnviarContrato, marcarGoogle],
  // Ciclo 2: o próprio documento (PDF por WhatsApp, enviado em enviar.ts) é a
  // notificação — sem texto adicional para não duplicar.
  contrato_enviado: [logar("contrato_enviado")],
  contrato_assinado: [logar("contrato_assinado"), sincronizarContratoAssinado],
  aguardando_pagamento: [logar("aguardando_pagamento"), criarPagamentos],
  confirmada: [logar("confirmada"), notif.confirmada, marcarGoogle, gerarComissoes],
  recusada: [
    logar("recusada"),
    notif.recusada,
    marcarGoogle,
    liberarVaga,
    devolverGratuito,
  ],
  cancelada: [
    logar("cancelada"),
    notif.cancelada,
    marcarGoogle,
    liberarVaga,
    devolverGratuito,
    estornarComissoes,
  ],
};

/** Executa os efeitos do estado destino; isola falhas (não propaga). */
export async function dispararEfeitos(ctx: ContextoEfeito): Promise<void> {
  const lista = efeitosPosTransicao[ctx.para] ?? [];

  // Retroativa (Spec 31 §6.3): filtra os efeitos externos. Só consulta o banco
  // quando o estado tem algum efeito suprimível (evita custo nas demais
  // transições).
  let efeitos = lista;
  if (lista.some((fn) => SUPRIMIVEIS_RETROATIVA.has(fn))) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("locacoes")
      .select("retroativa")
      .eq("id", ctx.locacaoId)
      .maybeSingle();
    if (data?.retroativa) {
      efeitos = lista.filter((fn) => !SUPRIMIVEIS_RETROATIVA.has(fn));
    }
  }

  for (const fn of efeitos) {
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
