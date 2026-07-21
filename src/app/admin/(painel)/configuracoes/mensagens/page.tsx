import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireColaborador } from "@/lib/auth/guards";
import { listarTemplatesGestao } from "@/lib/notificacoes/templates-dados";
import { MensagensClient } from "./mensagens-client";

export const metadata: Metadata = { title: "Modelos de mensagem" };

export default async function MensagensPage() {
  await requireColaborador();
  const templates = await listarTemplatesGestao();

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <Link
          href="/admin/configuracoes"
          className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="size-4" />
          Configurações
        </Link>
        <h2 className="mt-1 font-display text-lg font-semibold text-ink">
          Modelos de mensagem
        </h2>
        <p className="text-sm text-ink-muted">
          Edite o texto das mensagens automáticas (WhatsApp e e-mail) e ative ou
          desative cada uma. Use as variáveis para inserir dados da locação.
        </p>
      </div>

      <MensagensClient templates={templates} />
    </div>
  );
}
