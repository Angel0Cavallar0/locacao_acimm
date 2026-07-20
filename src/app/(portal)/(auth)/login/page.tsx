import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginAssociadoForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

/**
 * Login do associado (§5.2): documento + e-mail + senha. Já autenticado como
 * associado → vai direto ao portal.
 */
export default async function LoginAssociadoPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;

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

  const destino =
    next?.startsWith("/") && !next.startsWith("/admin") ? next : "";
  return <LoginAssociadoForm next={destino} />;
}
