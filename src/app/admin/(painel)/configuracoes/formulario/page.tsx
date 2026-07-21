import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireColaborador } from "@/lib/auth/guards";
import { camposAtivos, listarCamposGestao } from "@/lib/formulario/dados";
import { FormularioClient } from "./formulario-client";

export const metadata: Metadata = { title: "Formulário de solicitação" };

/**
 * Editor do formulário de solicitação (Spec 22). Colaborador (operação do dia a
 * dia — não é admin-only). Os campos criados aparecem imediatamente no portal e
 * no atendimento assistido, sem deploy.
 */
export default async function FormularioPage() {
  await requireColaborador();
  const [campos, ativos] = await Promise.all([
    listarCamposGestao(),
    camposAtivos(),
  ]);

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <Link
        href="/admin/configuracoes"
        className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"
      >
        <ChevronLeft className="size-4" />
        Configurações
      </Link>

      <div>
        <h1 className="text-lg font-semibold text-ink">
          Formulário de solicitação
        </h1>
        <p className="text-sm text-ink-muted">
          Campos extras que o associado responde ao solicitar. Renomear um campo
          atualiza a exibição em todas as locações; desativar o remove das novas
          solicitações sem apagar respostas antigas.
        </p>
      </div>

      <FormularioClient campos={campos} ativosPreview={ativos} />
    </div>
  );
}
