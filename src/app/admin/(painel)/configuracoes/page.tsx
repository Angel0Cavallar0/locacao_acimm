import { FileSignature, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { parsearModoEnvio } from "@/lib/contratos/tipos";
import { requireAdmin } from "@/lib/auth/guards";
import { isAutentiqueConfigured } from "@/lib/integracoes/autentique";
import { createAdminClient } from "@/lib/supabase/admin";
import { ContratoModoForm } from "./contrato-modo";

export const metadata: Metadata = { title: "Configurações" };

/** Configurações — admin only (Spec 03 §4.1/§5). requireAdmin é a autoridade. */
export default async function ConfiguracoesPage() {
  await requireAdmin();

  const admin = createAdminClient();
  const { data: cfg } = await admin
    .from("configuracoes")
    .select("valor")
    .eq("chave", "modo_envio_contrato")
    .maybeSingle();
  const modo = parsearModoEnvio(cfg?.valor);
  const autentiqueDisponivel = isAutentiqueConfigured();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <p className="text-sm text-ink-muted">
        Regras de negócio, integrações e equipe. As parametrizações avançadas
        chegam nos próximos specs.
      </p>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-brand/10 text-brand">
              <FileSignature className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-ink">Contratos</h3>
              <p className="text-xs text-ink-muted">
                Como o contrato é enviado ao locatário após a aprovação.
              </p>
            </div>
          </div>
          <ContratoModoForm
            modoInicial={modo}
            autentiqueDisponivel={autentiqueDisponivel}
          />
        </CardContent>
      </Card>

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
