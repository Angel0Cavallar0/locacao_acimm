import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Estado de sessão para roteamento de UI pública (Spec 01 / CLAUDE.md §5).
 *
 * A distinção de papel (associado × colaborador) é PROVISÓRIA nesta fase:
 * as tabelas `colaboradores`/`associados` e o fluxo de auth entram na Fase 1.
 * Enquanto elas não existem, a sondagem de papel falha silenciosamente e o
 * usuário autenticado é tratado como associado. O caso `anonimo` (o único
 * exercitável hoje, sem usuários cadastrados) é sempre correto.
 */
export type EstadoSessao = "anonimo" | "associado" | "colaborador";

export async function obterEstadoSessao(): Promise<EstadoSessao> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return "anonimo";

  // Colaborador tem prioridade (acesso ao painel). Sondagem defensiva: se a
  // tabela ainda não existe (pré-Fase 1), `error` vem preenchido e ignoramos.
  const { data: colaborador } = await supabase
    .from("colaboradores")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (colaborador) return "colaborador";

  return "associado";
}
