import type { Metadata } from "next";
import { PaginaEmConstrucao } from "@/components/admin/pagina-em-construcao";

export const metadata: Metadata = { title: "Calendário" };

export default function CalendarioPage() {
  return <PaginaEmConstrucao titulo="Calendário consolidado" />;
}
