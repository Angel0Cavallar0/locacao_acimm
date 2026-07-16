import type { ReactNode } from "react";

/**
 * Layout do route group `(portal)` — área do associado (autenticada).
 * A proteção de sessão e o chrome do portal entram no módulo de auth.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return <main className="flex flex-1 flex-col">{children}</main>;
}
