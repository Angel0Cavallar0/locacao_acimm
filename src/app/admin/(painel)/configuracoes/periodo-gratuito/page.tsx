import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { requireColaborador } from "@/lib/auth/guards";
import { listarRegras, salasSemRegra } from "@/lib/periodo-gratuito/regras";
import { PeriodoGratuitoClient } from "./periodo-gratuito-client";

export const metadata: Metadata = { title: "Período gratuito" };

/** CRUD das regras de período gratuito — colaborador (Spec 20 §5.1). */
export default async function PeriodoGratuitoPage() {
  await requireColaborador();
  const [regras, salas] = await Promise.all([listarRegras(), salasSemRegra()]);

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
        <h1 className="text-lg font-semibold text-ink">Período gratuito</h1>
        <p className="text-sm text-ink-muted">
          Benefício do sócio por sala: períodos elegíveis e quantos usos por
          ciclo mensal. As alterações valem para novos cálculos.
        </p>
      </div>

      <PeriodoGratuitoClient regras={regras} salasSemRegra={salas} />
    </div>
  );
}
