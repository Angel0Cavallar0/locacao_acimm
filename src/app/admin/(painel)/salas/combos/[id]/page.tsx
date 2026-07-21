import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { requireColaborador } from "@/lib/auth/guards";
import { listarNiveis } from "@/lib/coffee/dados";
import { parseDaterange } from "@/lib/precos/resolver-core";
import { createClient } from "@/lib/supabase/server";
import {
  ComboForm,
  type ComboDados,
  type PrecosPorSala,
} from "../../combo-form";

export const metadata: Metadata = { title: "Editar combo" };

export default async function EditarComboPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireColaborador();
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: combo },
    { data: comboSalas },
    { data: salas },
    { data: precos },
    niveis,
  ] = await Promise.all([
    supabase
      .from("combos")
      .select(
        "id, nome, descricao, tipo, tipo_desconto, desconto_valor, valor_centavos, dias_no_mes, periodo, coffee_nivel_id",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("combo_salas")
      .select("sala_id, aplica_desconto")
      .eq("combo_id", id),
    supabase
      .from("salas")
      .select("id, nome")
      .eq("ativa", true)
      .is("excluida_em", null)
      .order("ordem", { ascending: true })
      .order("nome", { ascending: true }),
    supabase
      .from("precos_sala")
      .select("sala_id, periodo, valor_centavos, indisponivel, vigencia")
      .eq("condicao", "associado"),
    listarNiveis(true),
  ]);
  const coffeeNiveis = niveis.map((n) => ({ id: n.id, nome: n.nome }));

  if (!combo) notFound();

  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const precosPorSala: PrecosPorSala = {};
  for (const p of precos ?? []) {
    if (p.indisponivel) continue;
    const { inicio, fim } = parseDaterange(String(p.vigencia));
    const vigente =
      (inicio === null || hoje >= inicio) && (fim === null || hoje < fim);
    if (!vigente) continue;
    const sala = (precosPorSala[p.sala_id] ??= {});
    if (sala[p.periodo] == null) sala[p.periodo] = p.valor_centavos;
  }

  const dados: ComboDados = {
    id: combo.id,
    nome: combo.nome,
    descricao: combo.descricao ?? "",
    tipo: combo.tipo,
    tipoDesconto: combo.tipo_desconto,
    descontoValor: combo.desconto_valor,
    valorCentavos: combo.valor_centavos,
    diasNoMes: combo.dias_no_mes,
    periodo: combo.periodo,
    salas: (comboSalas ?? []).map((s) => ({
      salaId: s.sala_id,
      aplicaDesconto: s.aplica_desconto,
    })),
    coffeeNivelId: combo.coffee_nivel_id ?? null,
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/admin/salas"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <ArrowLeft className="size-4" />
        Salas
      </Link>
      <h2 className="mt-2 mb-4 font-display text-lg font-semibold text-ink">
        {combo.nome}
      </h2>
      <ComboForm
        modo="editar"
        salasDisponiveis={salas ?? []}
        precosPorSala={precosPorSala}
        coffeeNiveis={coffeeNiveis}
        combo={dados}
      />
    </div>
  );
}
