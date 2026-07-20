import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Estado de sessão para roteamento de UI pública (Spec 01 / CLAUDE.md §5).
 * Colaborador tem prioridade (painel); associado é confirmado pelo vínculo em
 * `associados.user_id`. Um usuário logado sem nenhum dos dois cai em `anonimo`
 * (sessão órfã — a UI o trata como visitante).
 */
export type EstadoSessao = "anonimo" | "associado" | "colaborador";

export async function obterEstadoSessao(): Promise<EstadoSessao> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "anonimo";

  const { data: colaborador } = await supabase
    .from("colaboradores")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (colaborador) return "colaborador";

  const { data: associado } = await supabase
    .from("associados")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  return associado ? "associado" : "anonimo";
}
