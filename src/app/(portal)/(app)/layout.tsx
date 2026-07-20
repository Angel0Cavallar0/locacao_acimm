import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { PortalShell } from "@/components/portal/portal-shell";
import { requireAssociado } from "@/lib/auth/guards";

const SITUACAO_ROTULO: Record<string, string> = {
  suspenso: "suspensa",
  excluido: "excluída",
};

/**
 * Layout autenticado do portal. `requireAssociado()` é a autoridade (roda no
 * servidor a cada request). Banner persistente quando a situação ≠ ativo —
 * o acesso segue liberado (LGPD), mas novas locações ficam indisponíveis.
 */
export default async function PortalAppLayout({
  children,
}: {
  children: ReactNode;
}) {
  const { associado } = await requireAssociado();
  const nome = associado.razao_social ?? associado.nome;

  return (
    <PortalShell nome={nome}>
      {associado.situacao !== "ativo" ? (
        <div className="mx-auto mb-4 flex max-w-3xl items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <p className="text-ink">
            Sua situação junto à ACIMM está{" "}
            <span className="font-medium">
              {SITUACAO_ROTULO[associado.situacao] ?? associado.situacao}
            </span>
            . Novas locações estão indisponíveis — fale com a ACIMM. Seus dados e
            histórico continuam acessíveis.
          </p>
        </div>
      ) : null}
      {children}
    </PortalShell>
  );
}
