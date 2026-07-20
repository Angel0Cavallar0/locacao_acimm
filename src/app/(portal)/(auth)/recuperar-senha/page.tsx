import type { Metadata } from "next";
import { RecuperarAssociadoForm } from "./recuperar-form";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function RecuperarSenhaAssociadoPage() {
  return <RecuperarAssociadoForm />;
}
