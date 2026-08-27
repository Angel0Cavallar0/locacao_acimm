import "server-only";
import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  adicionarPendenciaSchema,
  arquivarPendenciaSchema,
} from "@/lib/validacoes/pendencias";

/**
 * Mutações de pendência de locação sem data — registro de intenção/
 * prioridade (sem valor/crédito, decisão travada com o cliente). Sempre via
 * admin client. Nada é deletado: sair = convertida (na assistida, via
 * p_pendencia_id) ou arquivada (mesmo padrão de lista_espera).
 */

export type ResultadoPendencia = { ok: true } | { erro: string };

function revalidar() {
  revalidatePath("/admin/pendencias");
}

export async function adicionarPendencia(
  input: unknown,
): Promise<ResultadoPendencia> {
  const { user } = await requireColaborador();
  const parsed = adicionarPendenciaSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;
  const admin = createAdminClient();

  const { error } = await admin.from("pendencias_locacao").insert({
    associado_id: v.associadoId,
    nome: v.nome,
    contato: v.contato,
    motivo: v.motivo || null,
    observacoes: v.observacoes || null,
    criado_por: user.id,
  });
  if (error) return { erro: "Não foi possível registrar a pendência." };

  revalidar();
  return { ok: true };
}

export async function arquivarPendencia(
  input: unknown,
): Promise<ResultadoPendencia> {
  const { user } = await requireColaborador();
  const parsed = arquivarPendenciaSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const admin = createAdminClient();

  const { error } = await admin
    .from("pendencias_locacao")
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

export async function restaurarPendencia(
  id: string,
): Promise<ResultadoPendencia> {
  await requireColaborador();
  const admin = createAdminClient();

  const { error } = await admin
    .from("pendencias_locacao")
    .update({ arquivado_em: null, arquivado_por: null, arquivado_motivo: null })
    .eq("id", id)
    .is("convertido_locacao_id", null)
    .not("arquivado_em", "is", null);
  if (error) return { erro: "Não foi possível restaurar." };

  revalidar();
  return { ok: true };
}
