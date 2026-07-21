import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

/** Antecedência mínima para pedidos de coffee break (Melhorias operacionais §A).
 * Global (uma config para todo coffee), parametrizável em `configuracoes`. */

export interface AntecedenciaCoffee {
  dias: number;
}

export const ANTECEDENCIA_COFFEE_PADRAO: AntecedenciaCoffee = { dias: 0 };

const antecedenciaSchema = z.object({
  dias: z.coerce.number().int().min(0).max(365),
});

/** Lê `configuracoes.antecedencia_coffee`; cai no padrão se ausente/ inválido. */
export async function obterAntecedenciaCoffee(): Promise<AntecedenciaCoffee> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("configuracoes")
    .select("valor")
    .eq("chave", "antecedencia_coffee")
    .maybeSingle();

  const parsed = antecedenciaSchema.safeParse(data?.valor);
  return parsed.success ? parsed.data : ANTECEDENCIA_COFFEE_PADRAO;
}
