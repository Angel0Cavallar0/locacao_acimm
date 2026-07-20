import type { Metadata } from "next";
import { PaginaEmConstrucao } from "@/components/admin/pagina-em-construcao";

export const metadata: Metadata = { title: "Perfil" };

export default function PerfilPage() {
  return (
    <PaginaEmConstrucao
      titulo="Meu perfil"
      descricao="Seus dados cadastrais e troca de senha entram em breve."
    />
  );
}
