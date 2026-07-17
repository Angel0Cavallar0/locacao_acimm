import type { Metadata } from "next";
import { PaginaEmConstrucao } from "@/components/admin/pagina-em-construcao";

export const metadata: Metadata = { title: "Comissões" };

export default function ComissoesPage() {
  return <PaginaEmConstrucao titulo="Comissões" />;
}
