"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  convidarColaboradorSchema,
  roleColaboradorSchema,
} from "@/lib/validacoes/auth";

const CAMINHO = "/admin/configuracoes/colaboradores";

export interface EstadoConvite {
  error?: string;
  success?: string;
}

export async function convidarColaborador(
  _prev: EstadoConvite,
  formData: FormData,
): Promise<EstadoConvite> {
  await requireAdmin();

  const parsed = convidarColaboradorSchema.safeParse({
    nome: formData.get("nome"),
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const { nome, email, role } = parsed.data;
  const admin = createAdminClient();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";

  // 1. Cria o auth user e dispara o convite por e-mail.
  const { data: convite, error: conviteError } =
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${appUrl}/admin/definir-senha`,
    });
  if (conviteError || !convite?.user) {
    return {
      error:
        conviteError?.message?.includes("already")
          ? "Este e-mail já possui cadastro."
          : "Não foi possível enviar o convite. Verifique o e-mail.",
    };
  }

  // 2. Registro em colaboradores.
  const { error: insertError } = await admin.from("colaboradores").insert({
    user_id: convite.user.id,
    nome,
    email,
    role,
    ativo: true,
  });

  // 3. Se o insert falhar, remover o auth user (não deixar órfão).
  if (insertError) {
    await admin.auth.admin.deleteUser(convite.user.id);
    return { error: "Não foi possível registrar o colaborador. Tente novamente." };
  }

  revalidatePath(CAMINHO);
  return { success: `Convite enviado para ${email}.` };
}

export interface ResultadoAcao {
  error?: string;
}

export async function definirAtivoColaborador(
  id: string,
  ativo: boolean,
): Promise<ResultadoAcao> {
  const { user } = await requireAdmin();
  const admin = createAdminClient();

  const { data: alvo, error } = await admin
    .from("colaboradores")
    .select("id, user_id, role, ativo")
    .eq("id", id)
    .maybeSingle();
  if (error || !alvo) return { error: "Colaborador não encontrado." };

  if (!ativo) {
    if (alvo.user_id === user.id) {
      return { error: "Você não pode desativar a si mesmo." };
    }
    if (alvo.role === "admin") {
      const { count } = await admin
        .from("colaboradores")
        .select("id", { count: "exact", head: true })
        .eq("role", "admin")
        .eq("ativo", true);
      if ((count ?? 0) <= 1) {
        return { error: "Não é possível desativar o último admin ativo." };
      }
    }
  }

  const { error: updateError } = await admin
    .from("colaboradores")
    .update({ ativo })
    .eq("id", id);
  if (updateError) return { error: "Não foi possível atualizar o status." };

  revalidatePath(CAMINHO);
  return {};
}

export async function definirRoleColaborador(
  id: string,
  roleRaw: string,
): Promise<ResultadoAcao> {
  await requireAdmin();

  const parsed = roleColaboradorSchema.safeParse(roleRaw);
  if (!parsed.success) return { error: "Papel inválido." };
  const role = parsed.data;

  const admin = createAdminClient();
  const { data: alvo, error } = await admin
    .from("colaboradores")
    .select("id, role, ativo")
    .eq("id", id)
    .maybeSingle();
  if (error || !alvo) return { error: "Colaborador não encontrado." };

  // Rebaixar um admin ativo não pode zerar o quadro de admins.
  if (role === "colaborador" && alvo.role === "admin" && alvo.ativo) {
    const { count } = await admin
      .from("colaboradores")
      .select("id", { count: "exact", head: true })
      .eq("role", "admin")
      .eq("ativo", true);
    if ((count ?? 0) <= 1) {
      return { error: "Não é possível rebaixar o último admin ativo." };
    }
  }

  const { error: updateError } = await admin
    .from("colaboradores")
    .update({ role })
    .eq("id", id);
  if (updateError) return { error: "Não foi possível alterar o papel." };

  revalidatePath(CAMINHO);
  return {};
}
