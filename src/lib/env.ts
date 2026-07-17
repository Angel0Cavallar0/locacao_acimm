import "server-only";
import { z } from "zod";

/**
 * Variáveis de ambiente (CLAUDE.md §3).
 *
 * Duas camadas:
 *  - `envCore`: validado EAGER na carga do módulo. Sem estas o app não sobe —
 *    falha imediata e clara. Inclui o secret do Supabase (server-only), por
 *    isso este módulo é `server-only`.
 *  - `getEnv*()`: getters LAZY por integração. Validam apenas quando chamados,
 *    com mensagem indicando qual variável falta. Assim o build/boot passa com
 *    apenas as variáveis core definidas; uma integração só exige suas chaves no
 *    momento em que é usada.
 *
 * REGRA: nenhum getter pode ser invocado no escopo de módulo.
 */

/* ------------------------------------------------------------------ */
/* Core — validação eager                                             */
/* ------------------------------------------------------------------ */

const coreSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url("NEXT_PUBLIC_SUPABASE_URL inválida"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY obrigatória"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "SUPABASE_SERVICE_ROLE_KEY obrigatória"),
  APP_URL: z.url("APP_URL inválida").default("http://localhost:3000"),
});

const coreParsed = coreSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  APP_URL: process.env.APP_URL,
});

if (!coreParsed.success) {
  const detalhes = coreParsed.error.issues
    .map((i) => `  - ${i.path.join(".") || "(raiz)"}: ${i.message}`)
    .join("\n");
  throw new Error(
    `Configuração core ausente/inválida (variáveis obrigatórias):\n${detalhes}`,
  );
}

/** Variáveis sempre disponíveis — validadas na carga do módulo. */
export const envCore = coreParsed.data;

/* ------------------------------------------------------------------ */
/* Integrações — validação lazy (só quando o getter é chamado)         */
/* ------------------------------------------------------------------ */

function validarIntegracao<S extends z.ZodType>(
  integracao: string,
  schema: S,
): z.infer<S> {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const faltando = [
      ...new Set(parsed.error.issues.map((i) => String(i.path[0]))),
    ].join(", ");
    throw new Error(
      `Integração "${integracao}" indisponível: variável(is) de ambiente ausente(s) ou inválida(s): ${faltando}.`,
    );
  }
  return parsed.data;
}

export function getEnvAutentique() {
  const v = validarIntegracao(
    "Autentique",
    z.object({ AUTENTIQUE_API_TOKEN: z.string().min(1) }),
  );
  return { apiToken: v.AUTENTIQUE_API_TOKEN };
}

export function getEnvGoogle() {
  const v = validarIntegracao(
    "Google Calendar",
    z.object({
      GOOGLE_CLIENT_ID: z.string().min(1),
      GOOGLE_CLIENT_SECRET: z.string().min(1),
      GOOGLE_REDIRECT_URI: z.url("GOOGLE_REDIRECT_URI inválida"),
      // Usada para cifrar o refresh token do Google no banco (§6.4).
      TOKEN_ENCRYPTION_KEY: z.string().min(1),
    }),
  );
  return {
    clientId: v.GOOGLE_CLIENT_ID,
    clientSecret: v.GOOGLE_CLIENT_SECRET,
    redirectUri: v.GOOGLE_REDIRECT_URI,
    tokenEncryptionKey: v.TOKEN_ENCRYPTION_KEY,
  };
}

export function getEnvCron() {
  const v = validarIntegracao(
    "Cron",
    z.object({ CRON_SECRET: z.string().min(1) }),
  );
  return { secret: v.CRON_SECRET };
}

export function getEnvEvolution() {
  const v = validarIntegracao(
    "Evolution API (WhatsApp)",
    z.object({
      EVOLUTION_API_URL: z.url("EVOLUTION_API_URL inválida"),
      EVOLUTION_API_KEY: z.string().min(1),
      EVOLUTION_INSTANCE: z.string().min(1),
    }),
  );
  return {
    apiUrl: v.EVOLUTION_API_URL,
    apiKey: v.EVOLUTION_API_KEY,
    instance: v.EVOLUTION_INSTANCE,
  };
}

export function getEnvResend() {
  const v = validarIntegracao(
    "Resend (e-mail)",
    z.object({ RESEND_API_KEY: z.string().min(1) }),
  );
  return { apiKey: v.RESEND_API_KEY };
}

export function getEnvSympla() {
  const v = validarIntegracao(
    "Sympla",
    z.object({ SYMPLA_API_TOKEN: z.string().min(1) }),
  );
  return { apiToken: v.SYMPLA_API_TOKEN };
}
