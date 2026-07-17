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
 * ÚNICO caminho para mudar o status de uma locação (Spec 06 §2.2/§5). Nenhum
 * `update status` deve existir fora daqui. Sequência: guard → valida a
 * transição no mapa → compare-and-swap atômico no banco (RPC) → efeitos
 * pós-commit → revalida. Conflito de agenda (23P01) e corrida de concorrência
 * viram mensagens claras; nada muda no banco nesses casos.
 */
export async function transicionarLocacao(input: {
  locacaoId: string;
  para: StatusLocacao;
  motivo?: string;
  observacao?: string;
}): Promise<ResultadoTransicao> {
  const { user } = await requireColaborador();
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
    p_autor: user.id,
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
    autorUserId: user.id,
    motivo: motivo || undefined,
  });

  revalidatePath("/admin/locacoes");
  revalidatePath(`/admin/locacoes/${input.locacaoId}`);
  revalidatePath("/admin/calendario");
  revalidatePath("/admin");
  return { ok: true };
}
