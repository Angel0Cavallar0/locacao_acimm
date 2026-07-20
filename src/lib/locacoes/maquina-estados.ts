import "server-only";
import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { descreverConflitoAgenda } from "./dados";
import { dispararEfeitos } from "./efeitos";
import {
  exigeMotivo,
  type StatusLocacao,
  transicaoPermitida,
} from "./maquina-estados-core";

export type ResultadoTransicao = { ok: true } | { erro: string };

/**
 * Núcleo da transição, parametrizado pelo autor (Spec 06 §2.2/§5). Sem guard e
 * sem revalidação — quem chama aplica ambos. Sequência: valida a transição no
 * mapa → compare-and-swap atômico no banco (RPC) → efeitos pós-commit.
 * Conflito de agenda (23P01) e corrida de concorrência viram mensagens claras;
 * nada muda no banco nesses casos. É o ÚNICO ponto que fala com a RPC de
 * transição — reusado pelo colaborador e pelo cancelamento do associado (§5).
 */
export async function aplicarTransicao(input: {
  locacaoId: string;
  para: StatusLocacao;
  /** `null` = Sistema (ex.: transições automáticas de contrato — Spec 13). */
  autorUserId: string | null;
  motivo?: string;
  observacao?: string;
}): Promise<ResultadoTransicao> {
  const admin = createAdminClient();

  const { data: loc } = await admin
    .from("locacoes")
    .select("id, status, inicio, fim")
    .eq("id", input.locacaoId)
    .maybeSingle();
  if (!loc) return { erro: "Locação não encontrada." };

  const de = loc.status as StatusLocacao;
  if (!transicaoPermitida(de, input.para)) {
    return { erro: "Transição de status inválida para o estado atual." };
  }

  const motivo = input.motivo?.trim() ?? "";
  if (exigeMotivo(input.para) && motivo.length === 0) {
    return { erro: "Informe o motivo." };
  }

  const { data, error } = await admin.rpc("transicionar_locacao", {
    p_locacao_id: input.locacaoId,
    p_de: de,
    p_para: input.para,
    p_autor: input.autorUserId,
    p_motivo: motivo || null,
    p_observacao: input.observacao?.trim() || null,
  });

  if (error) {
    if (error.code === "23P01") {
      return {
        erro: await descreverConflitoAgenda(
          input.locacaoId,
          loc.inicio as string,
          loc.fim as string,
        ),
      };
    }
    return { erro: "Não foi possível alterar o status." };
  }
  if (data === "conflito") {
    return {
      erro: "O estado da locação mudou. Recarregue a página e tente de novo.",
    };
  }

  await dispararEfeitos({
    locacaoId: input.locacaoId,
    de,
    para: input.para,
    autorUserId: input.autorUserId,
    motivo: motivo || undefined,
  });

  return { ok: true };
}

/**
 * ÚNICO caminho do COLABORADOR para mudar o status (Spec 06). Guard →
 * `aplicarTransicao` → revalida as telas do admin.
 */
export async function transicionarLocacao(input: {
  locacaoId: string;
  para: StatusLocacao;
  motivo?: string;
  observacao?: string;
}): Promise<ResultadoTransicao> {
  const { user } = await requireColaborador();
  const r = await aplicarTransicao({ ...input, autorUserId: user.id });
  if ("ok" in r) {
    revalidatePath("/admin/locacoes");
    revalidatePath(`/admin/locacoes/${input.locacaoId}`);
    revalidatePath("/admin/calendario");
    revalidatePath("/admin");
  }
  return r;
}
