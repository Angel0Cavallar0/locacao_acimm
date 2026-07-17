import type { Metadata } from "next";
import { PaginaEmConstrucao } from "@/components/admin/pagina-em-construcao";

export const metadata: Metadata = { title: "Contratos" };

export default function ContratosPage() {
  return <PaginaEmConstrucao titulo="Contratos e comprovantes" />;
}
