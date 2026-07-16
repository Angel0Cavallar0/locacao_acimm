import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Client Supabase para o servidor (Server Components, Route Handlers,
 * Server Actions). Usa a chave anon + sessão via cookies — a autoridade
 * de RLS é do usuário logado. Para operações administrativas use `admin.ts`.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // `setAll` chamado de um Server Component — ignorável quando há
            // middleware renovando a sessão.
          }
        },
      },
    },
  );
}
