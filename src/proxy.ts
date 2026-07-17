import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Proxy (Next 16, substitui o antigo `middleware.ts`): refresh de sessão e
 * proteção de UX do segmento `/admin/*`. Autoridade real fica nos guards.
 */
export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: ["/admin/:path*"],
};
