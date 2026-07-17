import type { Metadata } from "next";
import Link from "next/link";
import { requireColaborador } from "@/lib/auth/guards";
import { obterHorariosPeriodos } from "@/lib/locacoes/horarios";
import type { PeriodoDia } from "@/lib/dominio";
import { createClient } from "@/lib/supabase/server";
import { NovaLocacaoForm } from "./nova-locacao-form";

export const metadata: Metadata = { title: "Nova locação" };

const PERIODOS_VALIDOS: PeriodoDia[] = ["manha", "tarde", "noite", "dia_inteiro"];

function texto(v: string | string[] | undefined): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export default async function NovaLocacaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireColaborador();
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: salas }, { data: niveis }, { data: campos }, horarios] =
    await Promise.all([
      supabase
        .from("salas")
        .select("id, nome, capacidade")
        .eq("ativa", true)
        .is("excluida_em", null)
        .order("ordem", { ascending: true }),
      supabase
        .from("coffee_niveis")
        .select("id, nome, valor_pessoa_centavos")
        .eq("ativo", true)
        .order("ordem", { ascending: true }),
      supabase
        .from("campos_formulario")
        .select("id, rotulo, tipo, opcoes, obrigatorio")
        .eq("ativo", true)
        .order("ordem", { ascending: true }),
      obterHorariosPeriodos(),
    ]);

  const periodoPrefill = texto(sp.periodo);
  const prefill = {
    salaId: texto(sp.sala),
    data: texto(sp.data),
    periodo:
      periodoPrefill && PERIODOS_VALIDOS.includes(periodoPrefill as PeriodoDia)
        ? (periodoPrefill as PeriodoDia)
        : null,
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin/locacoes"
        className="mb-3 inline-block text-sm text-ink-muted hover:text-ink"
      >
        ← Locações
      </Link>
      <h2 className="mb-4 font-display text-lg font-semibold text-ink">
        Nova locação
      </h2>
      <NovaLocacaoForm
        salas={salas ?? []}
        niveis={niveis ?? []}
        campos={(campos ?? []).map((c) => ({
          id: c.id,
          rotulo: c.rotulo,
          tipo: c.tipo,
          opcoes: (c.opcoes as string[]) ?? [],
          obrigatorio: c.obrigatorio,
        }))}
        horarios={horarios}
        prefill={prefill}
      />
    </div>
  );
}
