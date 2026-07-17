import { Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Configurações" };

/** Configurações — admin only (Spec 03 §4.1/§5). requireAdmin é a autoridade. */
export default async function ConfiguracoesPage() {
  await requireAdmin();

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-4 text-sm text-ink-muted">
        Regras de negócio, integrações e equipe. As parametrizações avançadas
        chegam nos próximos specs.
      </p>
      <Link href="/admin/configuracoes/colaboradores" className="block">
        <Card className="transition-colors hover:bg-surface-muted">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Users className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-ink">
                Gestão de colaboradores
              </h3>
              <p className="text-xs text-ink-muted">
                Convidar, ativar/desativar e definir papéis.
              </p>
            </div>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
