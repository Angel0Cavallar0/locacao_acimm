import "server-only";
import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  salvarTemplateSchema,
  type SalvarTemplateInput,
} from "@/lib/validacoes/templates";
import { templatesPadrao } from "./templates-padrao";

/**
 * Escrita de `templates_mensagem` (Spec 25 §C). Guarda só overrides: texto igual
 * ao padrão (ou vazio) vira `null`; linha totalmente-padrão e ativa é removida
 * (volta ao default do código). Guard `requireColaborador` + service role.
 */

export type ResultadoTemplate = { ok: true } | { erro: string };

/** Override do canal: vazio ou igual ao padrão → null (usa o padrão do código). */
function override(valor: string, padrao: string | undefined): string | null {
  if (valor.trim().length === 0) return null;
  if (padrao !== undefined && valor.trim() === padrao.trim()) return null;
  return valor;
}

export async function salvarTemplate(
  input: SalvarTemplateInput,
): Promise<ResultadoTemplate> {
  const { user } = await requireColaborador();
  const parsed = salvarTemplateSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;
  const padrao = templatesPadrao[v.chave];
  if (!padrao) return { erro: "Template desconhecido." };

  const whatsapp_texto = padrao.canais.includes("whatsapp")
    ? override(v.whatsapp, padrao.whatsapp)
    : null;
  const email_assunto = padrao.canais.includes("email")
    ? override(v.emailAssunto, padrao.emailAssunto)
    : null;
  const email_corpo = padrao.canais.includes("email")
    ? override(v.emailCorpo, padrao.emailCorpo)
    : null;

  const admin = createAdminClient();

  // Linha redundante (ativa + sem override) → remove para manter a tabela enxuta.
  if (
    v.ativo &&
    whatsapp_texto === null &&
    email_assunto === null &&
    email_corpo === null
  ) {
    await admin.from("templates_mensagem").delete().eq("chave", v.chave);
    revalidatePath("/admin/configuracoes/mensagens");
    return { ok: true };
  }

  const { error } = await admin.from("templates_mensagem").upsert(
    {
      chave: v.chave,
      ativo: v.ativo,
      whatsapp_texto,
      email_assunto,
      email_corpo,
      atualizado_por: user.id,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "chave" },
  );
  if (error) return { erro: "Não foi possível salvar o template." };

  revalidatePath("/admin/configuracoes/mensagens");
  return { ok: true };
}
