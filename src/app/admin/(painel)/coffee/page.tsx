import type { Metadata } from "next";
import { PaginaEmConstrucao } from "@/components/admin/pagina-em-construcao";

export const metadata: Metadata = { title: "Coffee Break" };

export default function CoffeePage() {
  return <PaginaEmConstrucao titulo="Coffee break" />;
}
