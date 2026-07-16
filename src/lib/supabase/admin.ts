import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase com a SERVICE ROLE KEY — ignora RLS.
 * USO EXCLUSIVO server-side para operações administrativas (§4.9):
 * sync de associados, criação de colaboradores, jobs de cron.
 *
 * `import "server-only"` garante erro de build se vazar para o bundle do
 * cliente. NUNCA usar em Client Components.
 */
export function createAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não configurada — client admin indisponível.",
    );
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
