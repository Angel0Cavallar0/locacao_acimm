import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { requireColaborador } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { ComboForm } from "../../combo-form";

export const metadata: Metadata = { title: "Novo combo" };

export default async function NovoComboPage() {
  await requireColaborador();
  const supabase = await createClient();
  const { data: salas } = await supabase
    .from("salas")
    .select("id, nome")
    .eq("ativa", true)
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true });

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
      <ComboForm modo="criar" salasDisponiveis={salas ?? []} />
    </div>
  );
}
