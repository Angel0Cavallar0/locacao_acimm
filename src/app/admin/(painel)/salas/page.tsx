import type { Metadata } from "next";
import { PaginaEmConstrucao } from "@/components/admin/pagina-em-construcao";

export const metadata: Metadata = { title: "Salas" };

export default function SalasPage() {
  return <PaginaEmConstrucao titulo="Salas e preços" />;
}
