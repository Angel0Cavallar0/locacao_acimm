import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import {
  carregarConexao,
  contarPendencias,
  listarCalendariosConta,
} from "@/lib/google/conexao";
import type { CalendarioGoogle } from "@/lib/integracoes/google";
import { isGoogleConfigured } from "@/lib/integracoes/google";
import { GoogleIntegracao } from "./google-integracao";

export const metadata: Metadata = { title: "Integrações" };

/** Integrações — Google Calendar (Spec 18 §3). Admin only. */
export default async function IntegracoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();

  const configurado = isGoogleConfigured();
  const conexao = configurado ? await carregarConexao() : null;
  const pendencias = configurado ? await contarPendencias() : 0;

  // Lista de calendários só é útil (e possível) com conexão ativa.
  let calendarios: CalendarioGoogle[] = [];
  if (conexao?.status === "ativa") {
    try {
      calendarios = await listarCalendariosConta();
    } catch {
      // Google indisponível no momento — o select cai para o calendário atual.
      calendarios = [];
    }
  }

  const sp = await searchParams;
  const resultado = typeof sp.google === "string" ? sp.google : undefined;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link
        href="/admin/configuracoes"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="size-4" />
        Configurações
      </Link>

      <div>
        <h1 className="text-lg font-semibold text-ink">Integrações</h1>
        <p className="text-sm text-ink-muted">
          Conta do Google Agenda usada para espelhar locações e eventos e enviar
          os convites de agenda aos locatários.
        </p>
      </div>

      <GoogleIntegracao
        configurado={configurado}
        conexao={conexao}
        pendencias={pendencias}
        calendarios={calendarios}
        resultado={resultado}
      />
    </div>
  );
}
