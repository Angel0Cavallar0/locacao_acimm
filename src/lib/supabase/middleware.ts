import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Refresh da sessão Supabase a cada request e proteção de UX dos segmentos
 * `/admin/*` (colaborador) e do portal do associado (Spec 03 §2 / Spec 09 §6).
 * O middleware NÃO é autoridade — a checagem real é feita pelos guards em cada
 * layout/página/server action.
 */

// Rotas de auth públicas (não exigem sessão) — painel e portal.
const ROTAS_AUTH_PUBLICAS = [
  "/admin/login",
  "/admin/recuperar-senha",
  "/admin/definir-senha",
  "/login",
  "/cadastro",
  "/recuperar-senha",
  "/definir-senha",
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // IMPORTANTE: não rodar código entre createServerClient e getUser (padrão @supabase/ssr).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const ehRotaPublica = ROTAS_AUTH_PUBLICAS.some(
    (rota) => pathname === rota || pathname.startsWith(`${rota}/`),
  );

  if (!user && !ehRotaPublica) {
    const url = request.nextUrl.clone();
    // Redireciona ao login do segmento certo: painel → /admin/login, portal → /login.
    url.pathname = pathname.startsWith("/admin") ? "/admin/login" : "/login";
    url.search = "";
    // preserva o destino original (path + query) para redirecionar após o login
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
