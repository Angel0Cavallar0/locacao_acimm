import { CalendarClock, Cable, FileSignature, Gift, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { parsearModoEnvio } from "@/lib/contratos/tipos";
import { requireAdmin } from "@/lib/auth/guards";
import { isAutentiqueConfigured } from "@/lib/integracoes/autentique";
import { createAdminClient } from "@/lib/supabase/admin";
import { ContratoModoForm } from "./contrato-modo";
import { type RotinaCron, RotinasCron } from "./rotinas-cron";

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

  const { data: rotinasRows } = await admin.rpc("listar_rotinas_cron");
  const rotinas: RotinaCron[] = (
    (rotinasRows ?? []) as Array<{
      jobname: string;
      schedule: string;
      active: boolean;
      ultima_status: string | null;
      ultima_inicio: string | null;
      ultima_msg: string | null;
    }>
  ).map((r) => ({
    jobname: r.jobname,
    schedule: r.schedule,
    active: r.active,
    ultimaStatus: r.ultima_status,
    ultimaInicioUtc: r.ultima_inicio,
    ultimaMsg: r.ultima_msg,
  }));

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

      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-brand/10 text-brand">
              <CalendarClock className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-ink">
                Rotinas automáticas
              </h3>
              <p className="text-xs text-ink-muted">
                Jobs agendados (notificações, lembretes, PDF de compras).
              </p>
            </div>
          </div>
          <RotinasCron rotinas={rotinas} />
        </CardContent>
      </Card>

      <Link href="/admin/configuracoes/periodo-gratuito" className="block">
        <Card className="transition-colors hover:bg-surface-muted">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Gift className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-ink">Período gratuito</h3>
              <p className="text-xs text-ink-muted">
                Benefício do sócio por sala (períodos e usos por ciclo).
              </p>
            </div>
          </CardContent>
        </Card>
      </Link>

      <Link href="/admin/configuracoes/integracoes" className="block">
        <Card className="transition-colors hover:bg-surface-muted">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Cable className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-ink">Integrações</h3>
              <p className="text-xs text-ink-muted">
                Conta do Google Agenda (espelho e convites de agenda).
              </p>
            </div>
          </CardContent>
        </Card>
      </Link>

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
