import "server-only";
import { dataSP, horaSP } from "@/lib/calendario/tempo";
import type { StatusLocacao } from "@/lib/locacoes/maquina-estados-core";
import { envCore } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { type EventoGoogle, TIMEZONE } from "@/lib/integracoes/google";

/**
 * Monta o corpo do evento do Google a partir do estado ATUAL no banco (§2). O
 * reconciliador é um reconciliador de estado desejado: não confia na transição
 * que disparou a flag, lê o status atual e decide criar/atualizar/remover.
 */

/** Status em que a locação DEVE ter evento no calendário. */
const STATUS_COM_EVENTO: StatusLocacao[] = [
  "aprovada",
  "contrato_enviado",
  "contrato_assinado",
  "aguardando_pagamento",
  "confirmada",
  "realizada",
  "finalizada",
];

/** Status em que o locatário entra como convidado (negócio fechado, §2). */
const STATUS_COM_CONVIDADO: StatusLocacao[] = [
  "confirmada",
  "realizada",
  "finalizada",
];

export interface PayloadLocacao {
  existir: boolean;
  comConvidado: boolean;
  evento: EventoGoogle;
}

async function enderecoAcimm(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin
    .from("configuracoes")
    .select("valor")
    .eq("chave", "contato_acimm")
    .maybeSingle();
  const valor = (data?.valor ?? {}) as Record<string, unknown>;
  const endereco = typeof valor.endereco === "string" ? valor.endereco.trim() : "";
  return endereco || undefined;
}

export async function montarPayloadLocacao(
  locacaoId: string,
): Promise<PayloadLocacao | null> {
  const admin = createAdminClient();

  const { data: loc } = await admin
    .from("locacoes")
    .select(
      "numero, status, locatario_nome, locatario_email, inicio, fim, qtd_pessoas, tipo_evento",
    )
    .eq("id", locacaoId)
    .maybeSingle();
  if (!loc) return null;

  const l = loc as {
    numero: number;
    status: StatusLocacao;
    locatario_nome: string;
    locatario_email: string;
    inicio: string;
    fim: string;
    qtd_pessoas: number;
    tipo_evento: string | null;
  };

  const { data: salasRows } = await admin
    .from("locacao_salas")
    .select("salas ( nome )")
    .eq("locacao_id", locacaoId);
  const salas = (salasRows ?? [])
    .map((r) => {
      const s = (r as { salas: unknown }).salas;
      const nome = Array.isArray(s)
        ? (s[0] as { nome?: string })?.nome
        : (s as { nome?: string })?.nome;
      return nome ?? "";
    })
    .filter(Boolean)
    .join(", ");

  const { data: coffee } = await admin
    .from("coffee_breaks")
    .select("qtd_pessoas, coffee_niveis ( nome )")
    .eq("locacao_id", locacaoId)
    .maybeSingle();

  const existir = STATUS_COM_EVENTO.includes(l.status);
  const comConvidado = STATUS_COM_CONVIDADO.includes(l.status);

  const linhas: string[] = [
    `Data: ${dataSP(l.inicio)}`,
    `Horário: ${horaSP(l.inicio)}–${horaSP(l.fim)}`,
    `Salas: ${salas || "—"}`,
    `Pessoas: ${l.qtd_pessoas}`,
  ];
  if (l.tipo_evento) linhas.push(`Evento: ${l.tipo_evento}`);
  if (coffee) {
    const nivelRaw = (coffee as { coffee_niveis: unknown }).coffee_niveis;
    const nivel = Array.isArray(nivelRaw)
      ? (nivelRaw[0] as { nome?: string })?.nome
      : (nivelRaw as { nome?: string })?.nome;
    const qtd = (coffee as { qtd_pessoas: number }).qtd_pessoas;
    linhas.push(`Coffee break: ${nivel ?? "sim"} (${qtd} pessoa(s))`);
  }
  linhas.push("", `Detalhes: ${envCore.APP_URL}/admin/locacoes/${locacaoId}`);

  const evento: EventoGoogle = {
    summary: `LOC-${l.numero} · ${l.locatario_nome}${salas ? ` · ${salas}` : ""}`,
    description: linhas.join("\n"),
    location: await enderecoAcimm(admin),
    start: { dateTime: l.inicio, timeZone: TIMEZONE },
    end: { dateTime: l.fim, timeZone: TIMEZONE },
    attendees: comConvidado ? [{ email: l.locatario_email }] : undefined,
  };

  return { existir, comConvidado, evento };
}

export interface PayloadEvento {
  existir: boolean;
  evento: EventoGoogle;
}

export async function montarPayloadEventoInterno(
  eventoId: string,
): Promise<PayloadEvento | null> {
  const admin = createAdminClient();

  const { data: ev } = await admin
    .from("eventos_internos")
    .select("titulo, inicio, fim, cancelado, sympla_url, sala_id")
    .eq("id", eventoId)
    .maybeSingle();
  if (!ev) return null;

  const e = ev as {
    titulo: string;
    inicio: string;
    fim: string;
    cancelado: boolean;
    sympla_url: string | null;
    sala_id: string;
  };

  const { data: sala } = await admin
    .from("salas")
    .select("nome")
    .eq("id", e.sala_id)
    .maybeSingle();
  const salaNome = (sala as { nome?: string } | null)?.nome ?? "";

  const linhas: string[] = [
    `Data: ${dataSP(e.inicio)}`,
    `Horário: ${horaSP(e.inicio)}–${horaSP(e.fim)}`,
    `Sala: ${salaNome || "—"}`,
  ];
  if (e.sympla_url) linhas.push(`Inscrições: ${e.sympla_url}`);

  const evento: EventoGoogle = {
    summary: `${e.titulo} · Evento ACIMM`,
    description: linhas.join("\n"),
    location: await enderecoAcimm(admin),
    start: { dateTime: e.inicio, timeZone: TIMEZONE },
    end: { dateTime: e.fim, timeZone: TIMEZONE },
  };

  return { existir: !e.cancelado, evento };
}
