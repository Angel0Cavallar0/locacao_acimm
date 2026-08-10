import { z } from "zod";

/** Validações da tela de comissões (Ciclo 3 / Spec 33). */

// Percentual 0..100, aceita decimal (ex.: 7,5%). No máx. 2 casas.
const percentualSchema = z.coerce
  .number()
  .min(0, "Percentual mínimo 0.")
  .max(100, "Percentual máximo 100.")
  .refine((n) => Number.isFinite(n) && Math.round(n * 100) === n * 100, {
    message: "Use no máximo 2 casas decimais.",
  });

const centavosSchema = z.coerce
  .number()
  .int("Informe um valor válido.")
  .min(0, "O valor não pode ser negativo.");

/** Faixa: teto INCLUSIVO em centavos; `null` = faixa sem teto (a última). */
const faixaSchema = z.object({
  ateCentavos: centavosSchema.nullable(),
  percentual: percentualSchema,
});

/**
 * Grupo de comissionamento. A lista de faixas precisa terminar numa faixa aberta
 * (senão um mês acima do maior teto ficaria a 0%) e ter tetos estritamente
 * crescentes (senão a faixa escolhida dependeria da ordem do JSON).
 */
const grupoSchema = z
  .object({
    ativo: z.boolean(),
    faixas: z
      .array(faixaSchema)
      .min(1, "Configure ao menos uma faixa.")
      .max(6, "No máximo 6 faixas por grupo."),
  })
  .superRefine((g, ctx) => {
    const abertas = g.faixas.filter((f) => f.ateCentavos === null);
    if (abertas.length !== 1) {
      ctx.addIssue({
        code: "custom",
        message:
          "Deve haver exatamente uma faixa sem teto (a última, 'acima disso').",
        path: ["faixas"],
      });
      return;
    }
    if (g.faixas[g.faixas.length - 1].ateCentavos !== null) {
      ctx.addIssue({
        code: "custom",
        message: "A faixa sem teto deve ser a última.",
        path: ["faixas"],
      });
      return;
    }
    const tetos = g.faixas
      .slice(0, -1)
      .map((f) => f.ateCentavos as number);
    for (let i = 1; i < tetos.length; i++) {
      if (tetos[i] <= tetos[i - 1]) {
        ctx.addIssue({
          code: "custom",
          message: "Os limites das faixas devem ser crescentes e sem repetição.",
          path: ["faixas", i, "ateCentavos"],
        });
        return;
      }
    }
  });

/** Bônus: quando as DUAS metas são batidas, substitui as duas alíquotas. */
const bonusSchema = z
  .object({
    ativo: z.boolean(),
    percentual: percentualSchema,
    metaLocacaoCentavos: centavosSchema,
    metaCoffeeCentavos: centavosSchema,
  })
  .superRefine((b, ctx) => {
    if (b.ativo && b.percentual <= 0) {
      ctx.addIssue({
        code: "custom",
        message: "Defina o percentual do bônus para habilitá-lo.",
        path: ["percentual"],
      });
    }
  });

export const configComissoesSchema = z.object({
  locacao: grupoSchema,
  coffee: grupoSchema,
  bonus: bonusSchema,
});

export type ConfigComissoesInput = z.infer<typeof configComissoesSchema>;

export const ORIGENS_COMISSAO = ["locacao", "coffee"] as const;
export const VISOES_COMISSAO = [
  "a_pagar",
  "proximo_mes",
  "dois_meses",
] as const;

/** Mês 'YYYY-MM' (a competência é sempre o 1º dia desse mês). */
export const mesSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Informe um mês válido (AAAA-MM).");

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

/** Apurar / fechar / reabrir uma competência. */
export const competenciaSchema = z.object({ mes: mesSchema });

export type CompetenciaInput = z.infer<typeof competenciaSchema>;

/** Mês de recebimento da locação (null limpa o campo). */
export const mesRecebimentoSchema = z.object({
  locacaoId: z.string().uuid(),
  mes: mesSchema.nullable(),
});

export type MesRecebimentoInput = z.infer<typeof mesRecebimentoSchema>;
