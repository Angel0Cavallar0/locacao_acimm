"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { checarRateLimit } from "@/lib/auth/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { apenasDigitos } from "@/lib/utils/documento";
import { loginAssociadoSchema } from "@/lib/validacoes/associado";
import { emailSchema } from "@/lib/validacoes/auth";

const ERRO_GENERICO = "Dados de acesso inválidos.";

export interface EstadoLoginAssociado {
  error?: string;
}

/** Só aceita destinos internos do portal (evita open redirect e volta ao painel). */
function destinoSeguro(next: string): string {
  return next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/admin")
    ? next
    : "/disponibilidade";
}

export async function loginAssociado(
  _prev: EstadoLoginAssociado,
  formData: FormData,
): Promise<EstadoLoginAssociado> {
  const parsed = loginAssociadoSchema.safeParse({
    documento: formData.get("documento"),
    email: formData.get("email"),
    senha: formData.get("senha"),
  });
  if (!parsed.success) return { error: ERRO_GENERICO };

  const documento = apenasDigitos(parsed.data.documento);
  const { email, senha } = parsed.data;
  const nextRaw = String(formData.get("next") ?? "");

  // Rate limit por IP + documento (anti-enumeração, CLAUDE.md §4.7).
  const h = await headers();
  const ip =
    (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "desconhecido";
  const rl = checarRateLimit(`login-assoc:${ip}:${documento}`);
  if (!rl.permitido) {
    return { error: "Muitas tentativas. Aguarde um minuto e tente novamente." };
  }

  const supabase = await createClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (signInError) return { error: ERRO_GENERICO };

  // Valida que o documento informado bate com o do associado vinculado.
  // Qualquer divergência → encerra a sessão e responde de forma genérica.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: associado } = user
    ? await supabase
        .from("associados")
        .select("documento")
        .eq("user_id", user.id)
        .maybeSingle()
    : { data: null };

  if (!associado || apenasDigitos(associado.documento ?? "") !== documento) {
    await supabase.auth.signOut();
    return { error: ERRO_GENERICO };
  }

  redirect(destinoSeguro(nextRaw));
}

export interface EstadoRecuperar {
  message?: string;
}

const RESPOSTA_RECUPERAR =
  "Se o e-mail estiver cadastrado, você receberá as instruções.";

export async function recuperarSenhaAssociado(
  _prev: EstadoRecuperar,
  formData: FormData,
): Promise<EstadoRecuperar> {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) return { message: RESPOSTA_RECUPERAR };

  const supabase = await createClient();
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${appUrl}/definir-senha`,
  });

  return { message: RESPOSTA_RECUPERAR };
}
