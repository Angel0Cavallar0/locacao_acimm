import type { Metadata } from "next";
import { PaginaEmConstrucao } from "@/components/admin/pagina-em-construcao";
import { requireAssociado } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Nova solicitação" };

export default async function NovaSolicitacaoPage() {
  await requireAssociado();
  return (
    <PaginaEmConstrucao
      titulo="Nova solicitação"
      descricao="O formulário de solicitação de locação entra em breve."
    />
  );
}
