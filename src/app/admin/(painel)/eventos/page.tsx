import type { Metadata } from "next";
import { PaginaEmConstrucao } from "@/components/admin/pagina-em-construcao";

export const metadata: Metadata = { title: "Eventos ACIMM" };

export default function EventosPage() {
  return <PaginaEmConstrucao titulo="Eventos internos ACIMM" />;
}
