import { createBrowserClient } from "@supabase/ssr";

/**
 * Client Supabase para o browser (chave anon, protegida por RLS).
 * Uso em Client Components. Nunca expõe secrets.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  );
}
