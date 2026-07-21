import "server-only";
import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  adicionarFilaSchema,
  arquivarFilaSchema,
} from "@/lib/validacoes/lista-espera";

/**
 * Mutações da lista de espera (Spec 19). Sempre via admin client (RLS só libera
 * select do colaborador). Nada é deletado: sair da fila = convertida (§4) ou
 * arquivada (§5). Anti-duplicata igual à do portal (§7).
 */

export type ResultadoFila = { ok: true } | { erro: string };

function revalidar() {
  revalidatePath("/admin/lista-espera");
}

/** Adiciona manualmente (quem liga hoje). Bloqueia duplicata aguardando. */
export async function adicionarEntradaFila(
  input: unknown,
): Promise<ResultadoFila> {
  await requireColaborador();
  const parsed = adicionarFilaSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;
  const admin = createAdminClient();

  // Anti-duplicata: mesmo interessado (associado OU contato) + sala + data,
  // ainda aguardando (não convertida, não arquivada).
  let dup = admin
    .from("lista_espera")
    .select("id", { head: true, count: "exact" })
    .eq("data", v.data)
    .is("convertido_locacao_id", null)
    .is("arquivado_em", null);
  dup = v.salaId ? dup.eq("sala_id", v.salaId) : dup.is("sala_id", null);
  dup = v.associadoId
    ? dup.eq("associado_id", v.associadoId)
    : dup.eq("contato", v.contato);
  const { count } = await dup;
  if ((count ?? 0) > 0) {
    return { erro: "Este interessado já está na fila para esta sala/data." };
  }

  const { error } = await admin.from("lista_espera").insert({
    sala_id: v.salaId,
    data: v.data,
    associado_id: v.associadoId,
    nome: v.nome,
    contato: v.contato,
    observacoes: v.observacoes || null,
  });
  if (error) return { erro: "Não foi possível adicionar à fila." };

  revalidar();
  return { ok: true };
}

/** Arquiva (saiu da fila sem locar). Reversível enquanto a data não passou. */
export async function arquivarEntradaFila(
  input: unknown,
): Promise<ResultadoFila> {
  const { user } = await requireColaborador();
  const parsed = arquivarFilaSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const admin = createAdminClient();

  const { error } = await admin
    .from("lista_espera")
    .update({
      arquivado_em: new Date().toISOString(),
      arquivado_por: user.id,
      arquivado_motivo: parsed.data.motivo || null,
    })
    .eq("id", parsed.data.id)
    .is("convertido_locacao_id", null)
    .is("arquivado_em", null);
  if (error) return { erro: "Não foi possível arquivar." };

  revalidar();
  return { ok: true };
}

/** Restaura uma entrada arquivada de volta à fila. */
export async function restaurarEntradaFila(
  id: string,
): Promise<ResultadoFila> {
  await requireColaborador();
  const admin = createAdminClient();

  const { error } = await admin
    .from("lista_espera")
    .update({ arquivado_em: null, arquivado_por: null, arquivado_motivo: null })
    .eq("id", id)
    .is("convertido_locacao_id", null)
    .not("arquivado_em", "is", null);
  if (error) return { erro: "Não foi possível restaurar." };

  revalidar();
  return { ok: true };
}
