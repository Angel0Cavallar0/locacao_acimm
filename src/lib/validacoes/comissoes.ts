import { z } from "zod";

/** Validações da tela de comissões (Ciclo 2 / Spec 29 §5). */

const regraOrigemSchema = z.object({
  ativo: z.boolean(),
  // Percentual 0..100, aceita decimal (ex.: 7,5%). No máx. 2 casas.
  percentual: z.coerce
    .number()
    .min(0, "Percentual mínimo 0.")
    .max(100, "Percentual máximo 100.")
    .refine((n) => Number.isFinite(n) && Math.round(n * 100) === n * 100, {
      message: "Use no máximo 2 casas decimais.",
    }),
});

/** Config de percentuais por origem (admin only). Default de fábrica: 5% / 3%. */
export const configComissoesSchema = z.object({
  locacao: regraOrigemSchema,
  coffee: regraOrigemSchema,
});

export type ConfigComissoesInput = z.infer<typeof configComissoesSchema>;

export const ORIGENS_COMISSAO = ["locacao", "coffee"] as const;
export const VISOES_COMISSAO = [
  "a_pagar",
  "proximo_mes",
  "dois_meses",
] as const;

/** Recorte da visão (mesma resolução da tabela e do CSV, no servidor). */
export const filtroVisaoComissoesSchema = z.object({
  visao: z.enum(VISOES_COMISSAO).default("a_pagar"),
  origem: z.enum(ORIGENS_COMISSAO).nullable().default(null),
  busca: z.string().trim().max(120).nullable().default(null),
});

export type FiltroVisaoComissoesInput = z.infer<
  typeof filtroVisaoComissoesSchema
>;

/** Marca/desmarca comissões (reais) como pagas ao colaborador. */
export const marcarPagaComissoesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  pago: z.boolean(),
});

export type MarcarPagaComissoesInput = z.infer<
  typeof marcarPagaComissoesSchema
>;
