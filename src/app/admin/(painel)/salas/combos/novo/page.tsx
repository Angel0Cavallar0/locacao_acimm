import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { requireColaborador } from "@/lib/auth/guards";
import { listarNiveis } from "@/lib/coffee/dados";
import { parseDaterange } from "@/lib/precos/resolver-core";
import { createClient } from "@/lib/supabase/server";
import { ComboForm, type PrecosPorSala } from "../../combo-form";

export const metadata: Metadata = { title: "Novo combo" };

export default async function NovoComboPage() {
  await requireColaborador();
  const supabase = await createClient();

  const [{ data: salas }, { data: precos }, niveis] = await Promise.all([
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
        Novo combo
      </h2>
      <ComboForm
        modo="criar"
        salasDisponiveis={salas ?? []}
        precosPorSala={precosPorSala}
        coffeeNiveis={coffeeNiveis}
      />
    </div>
  );
}
