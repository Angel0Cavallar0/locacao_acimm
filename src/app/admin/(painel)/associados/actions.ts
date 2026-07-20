"use server";

import { requireColaborador } from "@/lib/auth/guards";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailSchema } from "@/lib/validacoes/auth";

/**
 * Gestão de contas de associado (Spec 09 §7) — fallback quando o e-mail do
 * Sophus está desatualizado. Dados cadastrais seguem somente leitura (a fonte é
 * o Sophus); aqui só se libera/reenvia/desvincula o ACESSO.
 */

export interface AssociadoGestao {
  id: string;
  nome: string;
  razaoSocial: string | null;
  documento: string | null;
  situacao: "ativo" | "suspenso" | "excluido";
  emails: string[];
  temConta: boolean;
  emailLogin: string | null;
}

export interface ResultadoGestao {
  error?: string;
  success?: string;
}

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";

export async function buscarAssociadosGestao(
  termo: string,
): Promise<AssociadoGestao[]> {
  await requireColaborador();
  if (termo.trim().length < 2) return [];

  const admin = createAdminClient();
  const { data: rows } = await admin.rpc("buscar_associados", {
    p_termo: termo,
    p_limite: 15,
  });
  const lista = (rows ?? []) as Array<{
    id: string;
    nome: string;
    razao_social: string | null;
    documento: string | null;
    emails: string[];
    situacao: "ativo" | "suspenso" | "excluido";
  }>;
  if (lista.length === 0) return [];

  // Enriquecer com o vínculo de conta (user_id) e o e-mail de login.
  const ids = lista.map((l) => l.id);
  const { data: vinculos } = await admin
    .from("associados")
    .select("id, user_id")
    .in("id", ids);
  const userIdPorAssoc = new Map<string, string | null>(
    (vinculos ?? []).map((v) => [v.id as string, (v.user_id as string) ?? null]),
  );

  const linked = (vinculos ?? []).filter((v) => v.user_id);
  const emailPorUser = new Map<string, string | null>();
  await Promise.all(
    linked.map(async (v) => {
      const { data } = await admin.auth.admin.getUserById(v.user_id as string);
      emailPorUser.set(v.user_id as string, data.user?.email ?? null);
    }),
  );

  return lista.map((l) => {
    const userId = userIdPorAssoc.get(l.id) ?? null;
    return {
      id: l.id,
      nome: l.nome,
      razaoSocial: l.razao_social,
      documento: l.documento,
      situacao: l.situacao,
      emails: l.emails ?? [],
      temConta: Boolean(userId),
      emailLogin: userId ? (emailPorUser.get(userId) ?? null) : null,
    };
  });
}

export async function liberarAcessoManual(
  associadoId: string,
  email: string,
): Promise<ResultadoGestao> {
  const { colaborador } = await requireColaborador();
  const parsed = emailSchema.safeParse({ email });
  if (!parsed.success) return { error: "Informe um e-mail válido." };

  const admin = createAdminClient();
  const { data: assoc } = await admin
    .from("associados")
    .select("id, user_id")
    .eq("id", associadoId)
    .maybeSingle();
  if (!assoc) return { error: "Associado não encontrado." };
  if (assoc.user_id) return { error: "Este associado já possui conta." };

  const { data: convite, error: conviteErr } =
    await admin.auth.admin.inviteUserByEmail(parsed.data.email, {
      redirectTo: `${appUrl()}/definir-senha`,
    });
  if (conviteErr || !convite?.user) {
    return {
      error: conviteErr?.message?.includes("already")
        ? "Este e-mail já possui cadastro em outra conta."
        : "Não foi possível enviar o convite. Verifique o e-mail.",
    };
  }

  const { data: vinculado, error: vincErr } = await admin
    .from("associados")
    .update({ user_id: convite.user.id })
    .eq("id", associadoId)
    .is("user_id", null)
    .select("id")
    .maybeSingle();
  if (vincErr || !vinculado) {
    await admin.auth.admin.deleteUser(convite.user.id);
    return { error: "Não foi possível vincular a conta. Tente novamente." };
  }

  console.info(
    `[associados] ${colaborador.id} liberou acesso manual ao associado ${associadoId} (${parsed.data.email}).`,
  );
  return { success: `Convite enviado para ${parsed.data.email}.` };
}

export async function reenviarConvite(
  associadoId: string,
): Promise<ResultadoGestao> {
  await requireColaborador();
  const admin = createAdminClient();

  const { data: assoc } = await admin
    .from("associados")
    .select("user_id")
    .eq("id", associadoId)
    .maybeSingle();
  if (!assoc?.user_id) return { error: "Este associado ainda não tem conta." };

  const { data: usuario } = await admin.auth.admin.getUserById(
    assoc.user_id as string,
  );
  const email = usuario.user?.email;
  if (!email) return { error: "Conta sem e-mail de login." };

  const { error } = await admin.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl()}/definir-senha`,
  });
  if (error) return { error: "Não foi possível reenviar. Tente novamente." };

  return { success: `Link de acesso reenviado para ${email}.` };
}

export async function desvincularConta(
  associadoId: string,
): Promise<ResultadoGestao> {
  const { colaborador } = await requireColaborador();
  const admin = createAdminClient();

  const { data: assoc } = await admin
    .from("associados")
    .select("user_id")
    .eq("id", associadoId)
    .maybeSingle();
  if (!assoc?.user_id) return { error: "Este associado não possui conta." };
  const userId = assoc.user_id as string;

  const { error: updErr } = await admin
    .from("associados")
    .update({ user_id: null })
    .eq("id", associadoId);
  if (updErr) return { error: "Não foi possível desvincular. Tente novamente." };

  const { error: delErr } = await admin.auth.admin.deleteUser(userId);
  console.info(
    `[associados] ${colaborador.id} desvinculou a conta do associado ${associadoId}${
      delErr ? " (auth user não removido)" : ""
    }.`,
  );

  return {
    success:
      "Conta desvinculada. O associado pode fazer um novo primeiro acesso.",
  };
}
