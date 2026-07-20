import type { Metadata } from "next";
import { PaginaEmConstrucao } from "@/components/admin/pagina-em-construcao";

export const metadata: Metadata = { title: "Minhas locações" };

export default function MinhasLocacoesPage() {
  return (
    <PaginaEmConstrucao
      titulo="Minhas locações"
      descricao="O acompanhamento das suas solicitações entra em breve."
    />
  );
}
