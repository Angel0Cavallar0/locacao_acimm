import "server-only";
import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { intervaloSP, spWallParaUtc } from "@/lib/calendario/tempo";
import type { PrioridadeEvento } from "@/lib/calendario/tipos";
import { contarParticipantes, SymplaError } from "@/lib/integracoes/sympla";
import { createAdminClient } from "@/lib/supabase/admin";

/** Mutações dos eventos internos (Spec 17). A agenda é sincronizada por trigger;
 * conflito de horário vira 23P01 → mensagem amigável com o ocupante. */

type Admin = ReturnType<typeof createAdminClient>;

export type ResultadoEvento = { ok: true; id?: string } | { erro: string };

interface CampoEvento {
  titulo: string;
  descricao?: string;
  salaId: string;
  data: string;
  horaInicio: string;
  horaFim: string;
  prioridade: PrioridadeEvento;
}

function somarDiasISO(data: string, n: number): string {
  const [a, m, d] = data.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Descreve o ocupante bloqueante de uma sala num intervalo (para o 23P01). */
async function descreverConflito(
  admin: Admin,
  salaId: string,
  inicioUtc: string,
  fimUtc: string,
): Promise<string> {
  const { data } = await admin.rpc("agenda_no_intervalo", {
    p_inicio: inicioUtc,
    p_fim: fimUtc,
  });
  type Item = {
    sala_id: string;
    bloqueante: boolean;
    origem: "locacao" | "evento_interno" | "bloqueio";
    inicio: string;
    fim: string;
    locacao_numero: number | null;
    locatario: string | null;
    evento_titulo: string | null;
    motivo: string | null;
  };
  const o = ((data ?? []) as Item[]).find(
    (i) => i.sala_id === salaId && i.bloqueante,
  );
  if (!o) return "Horário já ocupado nesse período. Ajuste sala ou horário.";
  let quem: string;
  if (o.origem === "locacao") {
    quem = `LOC-${String(o.locacao_numero ?? 0).padStart(6, "0")} — ${o.locatario ?? "locatário"}`;
  } else if (o.origem === "evento_interno") {
    quem = `evento “${o.evento_titulo ?? "ACIMM"}”`;
  } else {
    quem = `bloqueio “${o.motivo ?? "sem motivo"}”`;
  }
  return `Sala já ocupada em ${intervaloSP(o.inicio, o.fim)} por ${quem}. Ajuste sala ou horário.`;
}

async function inserirOcorrencia(
  admin: Admin,
  campo: CampoEvento,
  data: string,
  autorUserId: string,
): Promise<{ id: string } | { conflito: true } | { erro: string }> {
  const inicio = spWallParaUtc(data, campo.horaInicio);
  const fim = spWallParaUtc(data, campo.horaFim);
  const { data: novo, error } = await admin
    .from("eventos_internos")
    .insert({
      titulo: campo.titulo,
      descricao: campo.descricao || null,
      sala_id: campo.salaId,
      inicio,
      fim,
      prioridade: campo.prioridade,
      criado_por: autorUserId,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23P01") return { conflito: true };
    return { erro: "Não foi possível criar o evento." };
  }
  return { id: novo.id as string };
}

export async function criarEvento(input: CampoEvento & {
  repetirSemanalAte?: string;
}): Promise<
  { ok: true; id: string; conflitos: string[] } | { erro: string }
> {
  const { user } = await requireColaborador();
  const admin = createAdminClient();

  // Datas: a primeira + repetições semanais até `repetirSemanalAte` (inclusive).
  const datas: string[] = [input.data];
  if (input.repetirSemanalAte && input.repetirSemanalAte > input.data) {
    let d = somarDiasISO(input.data, 7);
    while (d <= input.repetirSemanalAte && datas.length < 60) {
      datas.push(d);
      d = somarDiasISO(d, 7);
    }
  }

  const conflitos: string[] = [];
  let primeiroId: string | null = null;

  for (const data of datas) {
    const r = await inserirOcorrencia(admin, input, data, user.id);
    if ("id" in r) {
      if (!primeiroId) primeiroId = r.id;
    } else if ("conflito" in r) {
      const inicio = spWallParaUtc(data, input.horaInicio);
      const fim = spWallParaUtc(data, input.horaFim);
      conflitos.push(
        `${await descreverConflito(admin, input.salaId, inicio, fim)}`,
      );
    } else {
      return { erro: r.erro };
    }
  }

  if (!primeiroId) {
    // Todas as ocorrências conflitaram.
    return {
      erro: conflitos[0] ?? "Não foi possível criar o evento (conflito de horário).",
    };
  }

  revalidatePath("/admin/eventos");
  revalidatePath("/admin/calendario");
  return { ok: true, id: primeiroId, conflitos };
}

export async function editarEvento(
  input: CampoEvento & { eventoId: string },
): Promise<ResultadoEvento> {
  await requireColaborador();
  const admin = createAdminClient();

  const inicio = spWallParaUtc(input.data, input.horaInicio);
  const fim = spWallParaUtc(input.data, input.horaFim);

  const { error } = await admin
    .from("eventos_internos")
    .update({
      titulo: input.titulo,
      descricao: input.descricao || null,
      sala_id: input.salaId,
      inicio,
      fim,
      prioridade: input.prioridade,
    })
    .eq("id", input.eventoId);
  if (error) {
    if (error.code === "23P01") {
      return { erro: await descreverConflito(admin, input.salaId, inicio, fim) };
    }
    return { erro: "Não foi possível salvar o evento." };
  }

  revalidatePath("/admin/eventos");
  revalidatePath(`/admin/eventos/${input.eventoId}`);
  revalidatePath("/admin/calendario");
  return { ok: true };
}

export async function cancelarEvento(eventoId: string): Promise<ResultadoEvento> {
  await requireColaborador();
  const admin = createAdminClient();
  const { error } = await admin
    .from("eventos_internos")
    .update({ cancelado: true })
    .eq("id", eventoId);
  if (error) return { erro: "Não foi possível cancelar o evento." };

  revalidatePath("/admin/eventos");
  revalidatePath(`/admin/eventos/${eventoId}`);
  revalidatePath("/admin/calendario");
  return { ok: true };
}

/** Remaneja o evento para outra sala (§7). Revalida conflito na transação. */
export async function moverEventoSala(input: {
  eventoId: string;
  salaId: string;
}): Promise<ResultadoEvento> {
  await requireColaborador();
  const admin = createAdminClient();

  const { data: ev } = await admin
    .from("eventos_internos")
    .select("prioridade, inicio, fim, cancelado")
    .eq("id", input.eventoId)
    .maybeSingle();
  if (!ev) return { erro: "Evento não encontrado." };
  if (ev.cancelado) return { erro: "Evento cancelado não pode ser remanejado." };
  if (ev.prioridade === "alta") {
    return { erro: "Evento de alta prioridade não é remanejado." };
  }

  const { error } = await admin
    .from("eventos_internos")
    .update({ sala_id: input.salaId })
    .eq("id", input.eventoId);
  if (error) {
    if (error.code === "23P01") {
      return {
        erro: await descreverConflito(
          admin,
          input.salaId,
          ev.inicio as string,
          ev.fim as string,
        ),
      };
    }
    return { erro: "Não foi possível remanejar o evento." };
  }

  revalidatePath("/admin/eventos");
  revalidatePath(`/admin/eventos/${input.eventoId}`);
  revalidatePath("/admin/calendario");
  return { ok: true };
}

/** Vincula ao evento Sympla + conta inscritos imediatamente (§5). */
export async function vincularSympla(input: {
  eventoId: string;
  symplaEventId: string;
  symplaUrl?: string;
}): Promise<{ ok: true; aviso?: string } | { erro: string }> {
  await requireColaborador();
  const admin = createAdminClient();

  const { error } = await admin
    .from("eventos_internos")
    .update({
      sympla_event_id: input.symplaEventId,
      sympla_url: input.symplaUrl || null,
    })
    .eq("id", input.eventoId);
  if (error) return { erro: "Não foi possível vincular o evento." };

  let aviso: string | undefined;
  try {
    const qtd = await contarParticipantes(input.symplaEventId);
    await admin
      .from("eventos_internos")
      .update({ qtd_inscritos: qtd, sincronizado_em: new Date().toISOString() })
      .eq("id", input.eventoId);
  } catch (e) {
    aviso =
      e instanceof SymplaError && e.tipo === "config"
        ? "Vínculo salvo, mas o token do Sympla parece inválido — verifique a configuração."
        : "Vínculo salvo. A contagem de inscritos será atualizada no próximo sync.";
  }

  revalidatePath(`/admin/eventos/${input.eventoId}`);
  revalidatePath("/admin/eventos");
  return { ok: true, aviso };
}

export async function desvincularSympla(
  eventoId: string,
): Promise<ResultadoEvento> {
  await requireColaborador();
  const admin = createAdminClient();
  const { error } = await admin
    .from("eventos_internos")
    .update({ sympla_event_id: null, sympla_url: null, qtd_inscritos: null })
    .eq("id", eventoId);
  if (error) return { erro: "Não foi possível desvincular." };

  revalidatePath(`/admin/eventos/${eventoId}`);
  revalidatePath("/admin/eventos");
  return { ok: true };
}
