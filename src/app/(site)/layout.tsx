import type { ReactNode } from "react";

/**
 * Layout do route group público `(site)`.
 * Páginas de entrada (tela inicial etc.) — sem menu, sem chrome de app.
 */
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <main className="flex flex-1 flex-col">{children}</main>;
}
