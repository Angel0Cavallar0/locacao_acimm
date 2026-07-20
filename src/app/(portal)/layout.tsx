import type { ReactNode } from "react";

/**
 * Route group `(portal)` — portal do associado. É apenas um agrupamento: o
 * chrome fica nos layouts aninhados `(auth)` (telas de acesso) e `(app)`
 * (área autenticada, com guard e shell). Passthrough para não aninhar `<main>`.
 */
export default function PortalLayout({ children }: { children: ReactNode }) {
  return children;
}
