import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { requireColaborador } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { ComboForm, type ComboDados } from "../../combo-form";

export const metadata: Metadata = { title: "Editar combo" };

export default async function EditarComboPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireColaborador();
  const { id } = await params;
  const supabase = await createClient();

  const [{ data: combo }, { data: comboSalas }, { data: salas }] =
    await Promise.all([
      supabase
        .from("combos")
        .select(
          "id, nome, descricao, tipo, tipo_desconto, desconto_valor, valor_centavos",
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
        .order("ordem", { ascending: true })
        .order("nome", { ascending: true }),
    ]);

  if (!combo) notFound();

  const dados: ComboDados = {
    id: combo.id,
    nome: combo.nome,
    descricao: combo.descricao ?? "",
    tipo: combo.tipo,
    tipoDesconto: combo.tipo_desconto,
    descontoValor: combo.desconto_valor,
    valorCentavos: combo.valor_centavos,
    salas: (comboSalas ?? []).map((s) => ({
      salaId: s.sala_id,
      aplicaDesconto: s.aplica_desconto,
    })),
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
      <ComboForm modo="editar" salasDisponiveis={salas ?? []} combo={dados} />
    </div>
  );
}
