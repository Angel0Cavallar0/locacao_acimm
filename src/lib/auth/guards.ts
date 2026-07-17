import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/**
 * Guards de autorização (Spec 03 §2). Primeira linha de TODA server action e
 * de todo layout/page em `/admin` (exceto rotas públicas de auth).
 *
 * A autoridade é sempre o servidor: mesmo com sessão Supabase válida, um
 * colaborador com `ativo = false` é barrado (revogação imediata).
 */

export type RoleColaborador = "admin" | "colaborador";

export interface Colaborador {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  role: RoleColaborador;
  ativo: boolean;
}

export interface CtxColaborador {
  user: User;
  colaborador: Colaborador;
}

export async function requireColaborador(): Promise<CtxColaborador> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: colaborador } = await supabase
    .from("colaboradores")
    .select("id, user_id, nome, email, role, ativo")
    .eq("user_id", user.id)
    .eq("ativo", true)
    .maybeSingle();

  if (!colaborador) {
    // Sessão de auth existe mas não é colaborador ativo → encerra e redireciona.
    await supabase.auth.signOut();
    redirect("/admin/login");
  }

  return { user, colaborador: colaborador as Colaborador };
}

export async function requireAdmin(): Promise<CtxColaborador> {
  const ctx = await requireColaborador();
  if (ctx.colaborador.role !== "admin") {
    redirect("/admin");
  }
  return ctx;
}
