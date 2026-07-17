import type { Metadata } from "next";
import { PaginaEmConstrucao } from "@/components/admin/pagina-em-construcao";

export const metadata: Metadata = { title: "Locações" };

export default function LocacoesPage() {
  return <PaginaEmConstrucao titulo="Locações" />;
}
