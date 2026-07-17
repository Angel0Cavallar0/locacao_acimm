import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Entrar no painel",
};

/**
 * Login do colaborador. Já autenticado como colaborador ativo → vai ao painel.
 * Não faz nenhum fetch de dados de negócio (Spec 03 §7).
 */
export default async function LoginPage({
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
    const { data: colaborador } = await supabase
      .from("colaboradores")
      .select("id")
      .eq("user_id", user.id)
      .eq("ativo", true)
      .maybeSingle();
    if (colaborador) redirect("/admin");
  }

  const destino = next?.startsWith("/admin") ? next : "/admin";
  return <LoginForm next={destino} />;
}
