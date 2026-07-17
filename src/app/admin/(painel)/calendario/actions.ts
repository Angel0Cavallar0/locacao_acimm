"use server";

import { revalidatePath } from "next/cache";
import { proximoDiaISO, spWallParaUtc } from "@/lib/calendario/tempo";
import type { AgendaItem, Sobreposicao } from "@/lib/calendario/tipos";
import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  bloqueioSchema,
  rangeAgendaSchema,
} from "@/lib/validacoes/calendario";
import { carregarAgenda } from "./dados";

export interface ResultadoAgenda {
  eventos?: AgendaItem[];
  sobreposicoes?: Sobreposicao[];
  error?: string;
}

export interface ResultadoBloqueio {
  error?: string;
  ok?: boolean;
}

/** Navegação de range/refresh do calendário (§3). Limite de 62 dias no Zod. */
export async function listarAgenda(range: {
  inicio: string;
  fim: string;
}): Promise<ResultadoAgenda> {
  await requireColaborador();

  const parsed = rangeAgendaSchema.safeParse(range);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Período inválido." };
  }

  const { eventos, sobreposicoes } = await carregarAgenda(
    parsed.data.inicio,
    parsed.data.fim,
  );
  return { eventos, sobreposicoes };
}

function descreverOcupante(item: AgendaItem): string {
  if (item.origem === "locacao") {
    const loc = `LOC-${String(item.locacaoNumero ?? 0).padStart(6, "0")}`;
    return `${loc} — ${item.locatario ?? "locatário"}`;
  }
  if (item.origem === "evento_interno") {
    return `evento “${item.eventoTitulo ?? "ACIMM"}”`;
  }
  return `bloqueio “${item.motivo ?? "sem motivo"}”`;
}

/** Bloqueio manual de sala (§6). Traduz o conflito 23P01 em mensagem amigável. */
export async function criarBloqueio(input: {
  salaId: string;
  data: string;
  diaInteiro: boolean;
  horaInicio?: string;
  horaFim?: string;
  motivo: string;
}): Promise<ResultadoBloqueio> {
  const { user } = await requireColaborador();

  const parsed = bloqueioSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;

  const inicioUtc = v.diaInteiro
    ? spWallParaUtc(v.data, "00:00")
    : spWallParaUtc(v.data, v.horaInicio as string);
  const fimUtc = v.diaInteiro
    ? spWallParaUtc(proximoDiaISO(v.data), "00:00")
    : spWallParaUtc(v.data, v.horaFim as string);

  const admin = createAdminClient();
  const { error } = await admin.rpc("criar_bloqueio", {
    p_sala: v.salaId,
    p_inicio: inicioUtc,
    p_fim: fimUtc,
    p_motivo: v.motivo,
    p_autor: user.id,
  });

  if (error) {
    // 23P01 = exclusion_violation: já há ocupação bloqueante nesse horário.
    if (error.code === "23P01") {
      const { eventos } = await carregarAgenda(inicioUtc, fimUtc);
      const ocupante = eventos.find(
        (e) => e.salaId === v.salaId && e.bloqueante,
      );
      return {
        error: ocupante
          ? `Horário já ocupado por ${descreverOcupante(ocupante)}. Ajuste o período do bloqueio.`
          : "Horário já ocupado nesse intervalo. Ajuste o período do bloqueio.",
      };
    }
    return { error: "Não foi possível criar o bloqueio." };
  }

  revalidatePath("/admin/calendario");
  return { ok: true };
}

/** Remove um bloqueio manual (§6). Só atinge linhas de origem 'bloqueio'. */
export async function removerBloqueio(
  agendaId: string,
): Promise<ResultadoBloqueio> {
  await requireColaborador();

  const admin = createAdminClient();
  const { error } = await admin
    .from("agenda_ocupacoes")
    .delete()
    .eq("id", agendaId)
    .eq("origem", "bloqueio");

  if (error) return { error: "Não foi possível remover o bloqueio." };

  revalidatePath("/admin/calendario");
  return { ok: true };
}
