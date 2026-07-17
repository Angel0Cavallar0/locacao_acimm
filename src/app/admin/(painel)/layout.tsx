import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { requireColaborador } from "@/lib/auth/guards";

/**
 * Layout de todo o painel autenticado. `requireColaborador()` é a autoridade:
 * roda no servidor a cada request e barra quem não é colaborador ativo
 * (Spec 03 §2/§4) — o middleware é só UX.
 */
export default async function PainelLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { colaborador } = await requireColaborador();

  return (
    <AdminShell nome={colaborador.nome} role={colaborador.role}>
      {children}
    </AdminShell>
  );
}
