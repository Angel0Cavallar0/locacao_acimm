import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { ColaboradoresClient } from "./colaboradores-client";

export const metadata: Metadata = { title: "Colaboradores" };

export interface ColaboradorRow {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  role: "admin" | "colaborador";
  ativo: boolean;
  criado_em: string;
}

/** Gestão de colaboradores — admin only (Spec 03 §5). */
export default async function ColaboradoresPage() {
  const { user } = await requireAdmin();

  // Service role: a policy de RLS só deixaria o admin ler o próprio registro.
  const admin = createAdminClient();
  const { data } = await admin
    .from("colaboradores")
    .select("id, user_id, nome, email, role, ativo, criado_em")
    .order("criado_em", { ascending: true });

  return (
    <ColaboradoresClient
      colaboradores={(data ?? []) as ColaboradorRow[]}
      meuUserId={user.id}
    />
  );
}
