import { z } from "zod";

/**
 * Validação de variáveis de ambiente no boot (CLAUDE.md §3).
 *
 * Regras:
 *  - Vars públicas (Supabase URL/anon, APP_URL) são obrigatórias sempre —
 *    sem elas o app não funciona; falha imediata.
 *  - Secrets server-only e chaves de integração: obrigatórias em produção,
 *    apenas warning em desenvolvimento (permite subir o dev sem todas as
 *    integrações configuradas — os módulos que dependem delas usam stub).
 *
 * NUNCA importar valores server-only em código de cliente. Este módulo só
 * lê secrets quando `typeof window === "undefined"`.
 */

const isProduction = process.env.NODE_ENV === "production";
const isServer = typeof window === "undefined";

function fail(title: string, error: z.ZodError): never {
  const details = error.issues
    .map((i) => `  - ${i.path.join(".") || "(raiz)"}: ${i.message}`)
    .join("\n");
  throw new Error(`${title}\n${details}`);
}

/* ------------------------------------------------------------------ */
/* Variáveis públicas — obrigatórias em qualquer ambiente             */
/* ------------------------------------------------------------------ */

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url("URL do Supabase inválida"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "chave anon obrigatória"),
  APP_URL: z.url("APP_URL inválida").default("http://localhost:3000"),
});

const publicParsed = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  APP_URL: process.env.APP_URL,
});

if (!publicParsed.success) {
  fail("Configuração pública ausente/ inválida:", publicParsed.error);
}

/* ------------------------------------------------------------------ */
/* Variáveis server-only                                              */
/* ------------------------------------------------------------------ */

const serverSchema = z.object({
  // Secrets essenciais do backend
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(1),
  TOKEN_ENCRYPTION_KEY: z.string().min(1),
  // Integrações externas (chaves fornecidas conforme forem disponibilizadas)
  SOPHUS_CLIENT_ID: z.string().min(1),
  SOPHUS_CLIENT_SECRET: z.string().min(1),
  SYMPLA_API_TOKEN: z.string().min(1),
  AUTENTIQUE_API_TOKEN: z.string().min(1),
  EVOLUTION_API_URL: z.url(),
  EVOLUTION_API_KEY: z.string().min(1),
  EVOLUTION_INSTANCE: z.string().min(1),
  RESEND_API_KEY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.url(),
});

type ServerEnv = Partial<z.infer<typeof serverSchema>>;

let serverEnv: ServerEnv = {};

if (isServer) {
  const parsed = serverSchema.partial().safeParse(process.env);
  // `partial()` nunca falha por ausência; usamos o schema estrito só para
  // decidir se, em produção, algo obrigatório está faltando.
  const strict = serverSchema.safeParse(process.env);

  if (!strict.success) {
    if (isProduction) {
      fail("Configuração server-side ausente em produção:", strict.error);
    } else {
      const faltando = [...new Set(strict.error.issues.map((i) => i.path.join(".")))];
      console.warn(
        `[env] Variáveis de integração ausentes em dev (usando stub): ${faltando.join(", ")}`,
      );
    }
  }

  serverEnv = parsed.success ? parsed.data : {};
}

/* ------------------------------------------------------------------ */
/* Export                                                             */
/* ------------------------------------------------------------------ */

export const env = {
  ...publicParsed.data,
  ...serverEnv,
} as const;

/** Acesso tipado às vars públicas (seguro no client). */
export const publicEnv = publicParsed.data;
