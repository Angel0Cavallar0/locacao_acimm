/**
 * Checklist do fluxo ideal da locação (Spec 32 §3.3) — projeção PURA a partir do
 * status atual + evidências (contrato, pagamento, flags de adicionais). Não é a
 * auditoria (essa é a timeline append-only); é "o que já foi e o que falta".
 */

import type { StatusLocacao } from "./maquina-estados-core";

export type EstadoEtapa = "concluida" | "pendente" | "cancelada";

export interface EtapaChecklist {
  chave: string;
  rotulo: string;
  estado: EstadoEtapa;
}

export interface EntradaChecklist {
  status: StatusLocacao;
  /** `contratos.status` (enviado/assinado…), quando há contrato. */
  contratoStatus?: string | null;
  /** Há adicional que "requer aprovação" (arte de divulgação — Spec 30). */
  temDivulgacao?: boolean;
  /** Todos os adicionais de divulgação estão aprovados. */
  divulgacaoAprovada?: boolean;
  /** Há adicional "sujeito a disponibilidade" (cozinha — Spec 30). */
  temCozinha?: boolean;
  /** Todos os adicionais de cozinha estão confirmados. */
  cozinhaConfirmada?: boolean;
}

/** Posição de cada status na régua do fluxo ideal (realizada = finalizada). */
const RANK: Record<StatusLocacao, number> = {
  rascunho: 0,
  solicitada: 1,
  em_analise: 1,
  aprovada: 2,
  contrato_enviado: 3,
  contrato_assinado: 4,
  aguardando_pagamento: 5,
  confirmada: 6,
  realizada: 7,
  finalizada: 7,
  recusada: -1,
  cancelada: -1,
};

export function locacaoEncerrada(status: StatusLocacao): boolean {
  return status === "recusada" || status === "cancelada";
}

/**
 * Monta as etapas do checklist. Em locação encerrada (recusada/cancelada) as
 * etapas ainda-não-concluídas viram `cancelada` (o fluxo parou). As etapas de
 * adicionais só aparecem quando o pedido tem o adicional correspondente.
 */
export function montarChecklist(e: EntradaChecklist): EtapaChecklist[] {
  const encerrada = locacaoEncerrada(e.status);
  const rank = RANK[e.status];
  const contratoEnviado =
    e.contratoStatus === "enviado" || e.contratoStatus === "assinado";
  const contratoAssinado = e.contratoStatus === "assinado";

  const passo = (
    chave: string,
    rotulo: string,
    concluida: boolean,
  ): EtapaChecklist => ({
    chave,
    rotulo,
    estado: concluida ? "concluida" : encerrada ? "cancelada" : "pendente",
  });

  const etapas: EtapaChecklist[] = [
    passo("solicitada", "Solicitação recebida", encerrada || rank >= 1),
    passo("aprovada", "Aprovação", rank >= 2),
    passo(
      "contrato_enviado",
      "Contrato enviado",
      rank >= 3 || contratoEnviado,
    ),
    passo(
      "contrato_assinado",
      "Contrato assinado",
      rank >= 4 || contratoAssinado,
    ),
  ];

  if (e.temDivulgacao) {
    etapas.push(
      passo(
        "divulgacao",
        "Arte de divulgação aprovada",
        Boolean(e.divulgacaoAprovada),
      ),
    );
  }
  if (e.temCozinha) {
    etapas.push(
      passo(
        "cozinha",
        "Uso da cozinha confirmado",
        Boolean(e.cozinhaConfirmada),
      ),
    );
  }

  etapas.push(passo("pagamento", "Pagamento recebido", rank >= 6));
  etapas.push(passo("realizada", "Evento realizado", rank >= 7));

  return etapas;
}
