import type { Metadata } from "next";
import { PaginaEmConstrucao } from "@/components/admin/pagina-em-construcao";
import { requireColaborador } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Nova locação" };

/**
 * Stub da nova locação assistida (Spec 07). Presente desde já para os atalhos
 * "Nova locação" do calendário não retornarem 404 (Spec 05 §4/§8).
 */
export default async function NovaLocacaoPage() {
  await requireColaborador();
  return (
    <PaginaEmConstrucao
      titulo="Nova locação assistida"
      descricao="O formulário de atendimento assistido, com cálculo de valores, chega no próximo bloco."
    />
  );
}
