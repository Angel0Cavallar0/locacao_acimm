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

export type SituacaoAssociado = "ativo" | "suspenso" | "excluido";

export interface Associado {
  id: string;
  user_id: string;
  nome: string;
  razao_social: string | null;
  documento: string | null;
  tipo_documento: "CPF" | "CNPJ" | null;
  emails: string[];
  telefone: string | null;
  situacao: SituacaoAssociado;
}

export interface CtxAssociado {
  user: User;
  associado: Associado;
}

/**
 * Guard do portal do associado (Spec 09 §6). Exige sessão + vínculo em
 * `associados` por `user_id` (a policy `associados_self_select` deixa o próprio
 * associado ler sua linha via RLS). Diferente do colaborador, a SITUAÇÃO não
 * barra o acesso: `suspenso`/`excluido` ainda logam e veem seus dados (LGPD) —
 * o bloqueio de novas locações é server-side no fluxo de solicitação (Spec 11).
 * Sem vínculo (ex.: colaborador tentando entrar no portal) → volta ao login.
 */
export async function requireAssociado(): Promise<CtxAssociado> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: associado } = await supabase
    .from("associados")
    .select(
      "id, user_id, nome, razao_social, documento, tipo_documento, emails, telefone, situacao",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (!associado) {
    await supabase.auth.signOut();
    redirect("/login");
  }

  return { user, associado: associado as Associado };
}
