import { z } from "zod";

/** Validações da tela de comissões (Spec 21 §5). */

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

/** Config de percentuais por origem (admin only). */
export const configComissoesSchema = z.object({
  locacao: regraOrigemSchema,
  coffee: regraOrigemSchema,
});

export type ConfigComissoesInput = z.infer<typeof configComissoesSchema>;

export const ORIGENS_COMISSAO = ["locacao", "coffee"] as const;
export const STATUS_COMISSAO = [
  "pendentes",
  "exportadas",
  "estornadas",
  "estornadas_exportadas",
] as const;

/** Filtro do CSV — mesmo recorte da tabela, resolvido no servidor. */
export const filtroExportComissoesSchema = z.object({
  competencia: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "Competência inválida.")
    .nullable()
    .default(null),
  origem: z.enum(ORIGENS_COMISSAO).nullable().default(null),
  status: z.enum(STATUS_COMISSAO).nullable().default(null),
  busca: z.string().trim().max(120).nullable().default(null),
});

export type FiltroExportComissoesInput = z.infer<
  typeof filtroExportComissoesSchema
>;
