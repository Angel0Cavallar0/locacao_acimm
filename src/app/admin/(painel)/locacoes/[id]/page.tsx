import type { Metadata } from "next";
import { PaginaEmConstrucao } from "@/components/admin/pagina-em-construcao";
import { requireColaborador } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Locação" };

/**
 * Stub do detalhe de locação (Spec 06). Existe desde já para que os links do
 * calendário (“Abrir locação”) nunca retornem 404 (Spec 05 §7).
 */
export default async function LocacaoDetalhePage() {
  await requireColaborador();
  return (
    <PaginaEmConstrucao
      titulo="Detalhe da locação"
      descricao="A ficha completa da locação, com linha do tempo e ações, chega no próximo módulo."
    />
  );
}
