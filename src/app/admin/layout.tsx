import type { ReactNode } from "react";

/**
 * Layout do segmento `/admin` — painel do colaborador (autenticado).
 * O middleware de proteção de `/admin/*` (§5.1) entra no módulo de auth.
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return <main className="flex flex-1 flex-col">{children}</main>;
}
