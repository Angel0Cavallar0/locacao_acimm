import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CadastroClient } from "./cadastro-client";

export const metadata: Metadata = { title: "Primeiro acesso" };

/**
 * Primeiro acesso do associado (§4). Já autenticado como associado → portal.
 */
export default async function CadastroPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: associado } = await supabase
      .from("associados")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (associado) redirect("/disponibilidade");
  }

  return <CadastroClient />;
}
