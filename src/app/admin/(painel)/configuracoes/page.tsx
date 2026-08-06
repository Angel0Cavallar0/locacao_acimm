import {
  CalendarClock,
  Cable,
  ChevronRight,
  FileSignature,
  FormInput,
  Gift,
  MessageCircle,
  MessageSquare,
  Users,
  Webhook,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { CardColapsavel } from "./card-colapsavel";
import { type RotinaCron, RotinasCron } from "./rotinas-cron";

export const metadata: Metadata = { title: "Configurações" };

/** Configurações — admin only (Spec 03 §4.1/§5). requireAdmin é a autoridade. */
export default async function ConfiguracoesPage() {
  await requireAdmin();

  const admin = createAdminClient();

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

      <CardColapsavel
        icon={<FileSignature className="size-5" />}
        titulo="Contratos"
        descricao="Como o contrato é enviado ao locatário após a aprovação."
      >
        <p className="text-sm text-ink-muted">
          Após a aprovação, o contrato é enviado <strong>por WhatsApp</strong> ao
          telefone do locatário (o e-mail do cadastro costuma ser do
          financeiro/RH). A via assinada volta pela plataforma — o associado faz
          o upload, ou a equipe marca como assinado.
        </p>
      </CardColapsavel>

      <CardColapsavel
        icon={<CalendarClock className="size-5" />}
        titulo="Rotinas automáticas"
        descricao="Jobs agendados (notificações, lembretes, PDF de compras)."
      >
        <RotinasCron rotinas={rotinas} />
      </CardColapsavel>

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
            <ChevronRight className="ml-auto size-5 shrink-0 text-ink-muted" />
          </CardContent>
        </Card>
      </Link>

      <Link href="/admin/configuracoes/formulario" className="block">
        <Card className="transition-colors hover:bg-surface-muted">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-brand/10 text-brand">
              <FormInput className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-ink">
                Formulário de solicitação
              </h3>
              <p className="text-xs text-ink-muted">
                Campos extras que o associado responde (criar, ordenar,
                desativar).
              </p>
            </div>
            <ChevronRight className="ml-auto size-5 shrink-0 text-ink-muted" />
          </CardContent>
        </Card>
      </Link>

      <Link href="/admin/configuracoes/mensagens" className="block">
        <Card className="transition-colors hover:bg-surface-muted">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-brand/10 text-brand">
              <MessageSquare className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-ink">
                Modelos de mensagem
              </h3>
              <p className="text-xs text-ink-muted">
                Texto das mensagens automáticas (WhatsApp e e-mail) e ativar ou
                desativar cada uma.
              </p>
            </div>
            <ChevronRight className="ml-auto size-5 shrink-0 text-ink-muted" />
          </CardContent>
        </Card>
      </Link>

      <Link href="/admin/configuracoes/whatsapp" className="block">
        <Card className="transition-colors hover:bg-surface-muted">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-brand/10 text-brand">
              <MessageCircle className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-ink">WhatsApp</h3>
              <p className="text-xs text-ink-muted">
                Conexão do número que envia as mensagens (status, QR code e
                reconexão).
              </p>
            </div>
            <ChevronRight className="ml-auto size-5 shrink-0 text-ink-muted" />
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
            <ChevronRight className="ml-auto size-5 shrink-0 text-ink-muted" />
          </CardContent>
        </Card>
      </Link>

      <Link href="/admin/configuracoes/webhooks" className="block">
        <Card className="transition-colors hover:bg-surface-muted">
          <CardContent className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-md bg-brand/10 text-brand">
              <Webhook className="size-5" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-ink">Webhooks</h3>
              <p className="text-xs text-ink-muted">
                Disparo de automações externas (sincronização de associados).
              </p>
            </div>
            <ChevronRight className="ml-auto size-5 shrink-0 text-ink-muted" />
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
            <ChevronRight className="ml-auto size-5 shrink-0 text-ink-muted" />
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
