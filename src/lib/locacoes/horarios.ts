import "server-only";
import { z } from "zod";
import type { PeriodoDia } from "@/lib/dominio";
import { createAdminClient } from "@/lib/supabase/admin";

/** Elo período → faixa de horário (Spec 07 §2), parametrizável em `configuracoes`. */

export interface FaixaHorario {
  inicio: string;
  fim: string;
}
export type HorariosPeriodos = Record<PeriodoDia, FaixaHorario>;

export const HORARIOS_PADRAO: HorariosPeriodos = {
  manha: { inicio: "08:00", fim: "12:00" },
  tarde: { inicio: "13:00", fim: "18:00" },
  noite: { inicio: "18:00", fim: "23:00" },
  dia_inteiro: { inicio: "08:00", fim: "18:00" },
};

const faixaSchema = z.object({
  inicio: z.string().regex(/^\d{2}:\d{2}$/),
  fim: z.string().regex(/^\d{2}:\d{2}$/),
});
const horariosSchema = z.object({
  manha: faixaSchema,
  tarde: faixaSchema,
  noite: faixaSchema,
  dia_inteiro: faixaSchema,
});

/** Lê `configuracoes.horarios_periodos`; cai no padrão se ausente/ inválido. */
export async function obterHorariosPeriodos(): Promise<HorariosPeriodos> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("configuracoes")
    .select("valor")
    .eq("chave", "horarios_periodos")
    .maybeSingle();

  const parsed = horariosSchema.safeParse(data?.valor);
  return parsed.success ? parsed.data : HORARIOS_PADRAO;
}
