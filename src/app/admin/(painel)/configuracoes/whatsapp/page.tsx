import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth/guards";
import {
  type EstadoConexaoWhatsapp,
  isEvolutionConfigured,
  obterEstadoInstancia,
  obterInfoInstancia,
} from "@/lib/integracoes/evolution";
import { WhatsappConexao } from "./whatsapp-client";

export const metadata: Metadata = { title: "WhatsApp" };

/**
 * Configurações — Conexão do WhatsApp (Spec 28). Admin only. Estado lido em
 * tempo real da instância; nenhuma tabela envolvida (feature stateless).
 */
export default async function WhatsappPage() {
  await requireAdmin();

  const configurado = isEvolutionConfigured();

  let estadoInicial: EstadoConexaoWhatsapp = "desconhecido";
  let numero: string | null = null;
  let perfil: string | null = null;

  if (configurado) {
    const [estado, info] = await Promise.all([
      obterEstadoInstancia(),
      obterInfoInstancia(),
    ]);
    estadoInicial = estado;
    numero = info.numero;
    perfil = info.perfil;
  }

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
        <h1 className="text-lg font-semibold text-ink">WhatsApp</h1>
        <p className="text-sm text-ink-muted">
          Conexão do número que envia as mensagens automáticas do sistema. Veja
          o status, gere o QR code para conectar um aparelho e faça testes.
        </p>
      </div>

      <WhatsappConexao
        configurado={configurado}
        estadoInicial={estadoInicial}
        numero={numero}
        perfil={perfil}
      />
    </div>
  );
}
