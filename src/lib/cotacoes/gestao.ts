import "server-only";
import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { calcularValores } from "@/lib/locacoes/calcular";
import { createAdminClient } from "@/lib/supabase/admin";
import { criarCotacaoSchema } from "@/lib/validacoes/cotacoes";

/**
 * Cotação de aluguel — orçamento pendente que reusa o mesmo motor de preço
 * da locação (`calcularValores()`), mas NUNCA checa disponibilidade nem
 * materializa agenda_ocupacoes (decisão travada: cotação não reserva).
 */

export type ResultadoCotacao = { ok: true; id: string } | { erro: string };
export type ResultadoAcaoCotacao = { ok: true } | { erro: string };

function revalidar() {
  revalidatePath("/admin/cotacoes");
}

export async function criarCotacao(input: unknown): Promise<ResultadoCotacao> {
  const { user } = await requireColaborador();
  const parsed = criarCotacaoSchema.safeParse(input);
  if (!parsed.success) {
    return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const v = parsed.data;
  const admin = createAdminClient();

  if (v.condicao === "associado" && !v.associadoId) {
    return { erro: "Selecione o associado." };
  }

  const calc = await calcularValores({
    salaIds: v.salaIds,
    data: v.data,
    periodo: v.periodo,
    condicao: v.condicao,
    coffee: v.coffee
      ? { nivelId: v.coffee.nivelId, qtdPessoas: v.coffee.qtdPessoas, adicionaisCentavos: 0 }
      : null,
    adicionais: v.adicionais.map((a) => ({
      quantidade: 1,
      valorUnitarioCentavos: a.valorCentavos,
    })),
    associadoId: v.associadoId,
  });

  const { data: row, error } = await admin
    .from("cotacoes")
    .insert({
      condicao: v.condicao,
      associado_id: v.associadoId,
      locatario_nome: v.locatarioNome,
      locatario_documento: v.locatarioDocumento || null,
      locatario_email: v.locatarioEmail || null,
      locatario_telefone: v.locatarioTelefone || null,
      sala_ids: v.salaIds,
      data: v.data,
      periodo: v.periodo,
      qtd_pessoas: v.qtdPessoas,
      parametros: {
        coffee: v.coffee,
        adicionais: v.adicionais,
      },
      resultado: calc,
      valor_total_centavos: calc.totalCentavos,
      status: "pendente",
      criado_por: user.id,
    })
    .select("id")
    .single();
  if (error || !row) return { erro: "Não foi possível salvar a cotação." };

  revalidar();
  return { ok: true, id: row.id as string };
}

export async function arquivarCotacao(id: string): Promise<ResultadoAcaoCotacao> {
  await requireColaborador();
  const admin = createAdminClient();

  const { error } = await admin
    .from("cotacoes")
    .update({ status: "arquivada" })
    .eq("id", id)
    .eq("status", "pendente");
  if (error) return { erro: "Não foi possível arquivar a cotação." };

  revalidar();
  return { ok: true };
}
