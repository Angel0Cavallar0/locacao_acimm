import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import { obterWebhookAssociados } from "@/lib/associados/webhook";
import { WebhooksClient } from "./webhooks-client";

export const metadata: Metadata = { title: "Webhooks" };

export default async function WebhooksPage() {
  await requireAdmin();
  const { url } = await obterWebhookAssociados();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <Link
          href="/admin/configuracoes"
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="size-4" />
          Configurações
        </Link>
        <h1 className="mt-1 font-display text-lg font-semibold text-ink">
          Webhooks
        </h1>
        <p className="text-sm text-ink-muted">
          Disparo de automações externas. A sincronização de associados aciona
          um workflow que atualiza a base a partir do sistema de cadastro.
        </p>
      </div>

      <WebhooksClient urlInicial={url} />
    </div>
  );
}
