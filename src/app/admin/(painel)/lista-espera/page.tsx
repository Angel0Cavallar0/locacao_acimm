import type { Metadata } from "next";
import { PaginaEmConstrucao } from "@/components/admin/pagina-em-construcao";

export const metadata: Metadata = { title: "Lista de Espera" };

export default function ListaEsperaPage() {
  return <PaginaEmConstrucao titulo="Lista de espera" />;
}
