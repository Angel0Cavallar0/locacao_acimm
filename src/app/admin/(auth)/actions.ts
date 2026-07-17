"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checarRateLimit } from "@/lib/auth/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { emailSchema, loginSchema } from "@/lib/validacoes/auth";

const ERRO_GENERICO = "E-mail ou senha inválidos.";

export interface EstadoLogin {
  error?: string;
}

export async function loginColaborador(
  _prev: EstadoLogin,
  formData: FormData,
): Promise<EstadoLogin> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    senha: formData.get("senha"),
  });
  if (!parsed.success) return { error: ERRO_GENERICO };

  const { email, senha } = parsed.data;
  const nextRaw = String(formData.get("next") ?? "");

  // Rate limit por IP + e-mail (anti-enumeração).
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconhecido";
  const rl = checarRateLimit(`login:${ip}:${email.toLowerCase()}`);
  if (!rl.permitido) {
    return { error: "Muitas tentativas. Aguarde um minuto e tente novamente." };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (signInError) return { error: ERRO_GENERICO };

  // Confirma que é um colaborador ATIVO; senão encerra a sessão e responde
  // de forma genérica (não vaza que o auth user existe).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: colaborador } = user
    ? await supabase
        .from("colaboradores")
        .select("id")
        .eq("user_id", user.id)
        .eq("ativo", true)
        .maybeSingle()
    : { data: null };

  if (!colaborador) {
    await supabase.auth.signOut();
    return { error: ERRO_GENERICO };
  }

  // Só aceita destinos internos ao painel (evita open redirect).
  const destino = nextRaw.startsWith("/admin") ? nextRaw : "/admin";
  redirect(destino);
}

export interface EstadoRecuperar {
  message?: string;
  error?: string;
}

const RESPOSTA_RECUPERAR =
  "Se o e-mail estiver cadastrado, você receberá as instruções.";

export async function recuperarSenha(
  _prev: EstadoRecuperar,
  formData: FormData,
): Promise<EstadoRecuperar> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  // Resposta idêntica havendo ou não cadastro (anti-enumeração).
  if (!parsed.success) return { message: RESPOSTA_RECUPERAR };

  const supabase = await createClient();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/admin/definir-senha`,
  });

  return { message: RESPOSTA_RECUPERAR };
}
