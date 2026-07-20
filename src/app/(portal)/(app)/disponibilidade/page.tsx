import type { Metadata } from "next";
import { PaginaEmConstrucao } from "@/components/admin/pagina-em-construcao";

export const metadata: Metadata = { title: "Disponibilidade" };

export default function DisponibilidadePage() {
  return (
    <PaginaEmConstrucao
      titulo="Disponibilidade"
      descricao="A consulta de horários livres por sala entra em breve."
    />
  );
}
