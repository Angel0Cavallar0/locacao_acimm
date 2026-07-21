import { z } from "zod";

/** Schemas Zod de salas e preços (Spec 04). */

export const salaSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome"),
  descricao: z.string().trim().max(2000).optional().default(""),
  capacidade: z.coerce
    .number()
    .int("Capacidade inválida")
    .positive("Capacidade deve ser maior que zero"),
  equipamentos: z.array(z.string().trim().min(1)).max(50).default([]),
  ativa: z.boolean().default(true),
  diasAntecedenciaMinima: z.coerce
    .number()
    .int("Antecedência inválida")
    .min(0, "Antecedência não pode ser negativa")
    .max(365, "Antecedência máxima de 365 dias")
    .default(0),
});

export type SalaInput = z.infer<typeof salaSchema>;

export const periodoSchema = z.enum(["manha", "tarde", "noite", "dia_inteiro"]);
export const condicaoSchema = z.enum(["associado", "nao_associado"]);

export const diasSemanaSchema = z
  .array(z.number().int().min(0).max(6))
  .min(1, "Selecione ao menos um dia")
  .refine((ds) => new Set(ds).size === ds.length, "Dias repetidos");

export const precoSchema = z.object({
  salaId: z.uuid(),
  condicao: condicaoSchema,
  periodo: periodoSchema,
  diasSemana: diasSemanaSchema,
  valorCentavos: z.coerce
    .number()
    .int("Valor inválido")
    .min(0, "Valor não pode ser negativo"),
  indisponivel: z.boolean().default(false),
});

export type PrecoInput = z.infer<typeof precoSchema>;

export const categoriaHoraAdicionalSchema = z.enum([
  "comercial",
  "noturno",
  "sabado_domingo",
]);

export const horaAdicionalSchema = z.object({
  salaId: z.uuid(),
  minutos: z.number().int().min(0).max(1440).nullable(),
  valores: z
    .array(
      z.object({
        condicao: condicaoSchema,
        categoria: categoriaHoraAdicionalSchema,
        valorCentavos: z.number().int().min(0),
      }),
    )
    .max(6),
});

export const tipoComboSchema = z.enum([
  "desconto_multi_sala",
  "assinatura_mensal",
  "evento_privativo",
]);
export const tipoDescontoSchema = z.enum(["percentual", "valor"]);

export const comboSchema = z
  .object({
    nome: z.string().trim().min(1, "Informe o nome"),
    descricao: z.string().trim().max(2000).optional().default(""),
    tipo: tipoComboSchema,
    tipoDesconto: tipoDescontoSchema.nullable().default(null),
    descontoValor: z.number().int().min(0).nullable().default(null),
    valorCentavos: z.number().int().min(0).nullable().default(null),
    diasNoMes: z.number().int().min(1).max(31).nullable().default(null),
    periodo: periodoSchema.nullable().default(null),
    salas: z
      .array(z.object({ salaId: z.uuid(), aplicaDesconto: z.boolean() }))
      .default([]),
    /** Coffee break obrigatório do multi-sala (opcional) — Spec 26. */
    coffeeNivelId: z.uuid().nullable().default(null),
    /** Exige QUALQUER coffee (sem fixar nível) — Spec 26. */
    coffeeQualquer: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === "desconto_multi_sala") {
      if (v.salas.length < 2)
        ctx.addIssue({
          code: "custom",
          message: "Selecione ao menos duas salas.",
          path: ["salas"],
        });
      if (!v.tipoDesconto)
        ctx.addIssue({
          code: "custom",
          message: "Escolha o tipo de desconto.",
          path: ["tipoDesconto"],
        });
      if (v.descontoValor == null)
        ctx.addIssue({
          code: "custom",
          message: "Informe o valor do desconto.",
          path: ["descontoValor"],
        });
      if (v.tipoDesconto === "percentual" && (v.descontoValor ?? 0) > 100)
        ctx.addIssue({
          code: "custom",
          message: "Percentual máximo de 100.",
          path: ["descontoValor"],
        });
      if (!v.salas.some((s) => s.aplicaDesconto))
        ctx.addIssue({
          code: "custom",
          message: "Marque em qual sala o desconto incide.",
          path: ["salas"],
        });
    }
    if (v.tipo === "assinatura_mensal") {
      if (v.salas.length !== 1)
        ctx.addIssue({
          code: "custom",
          message: "Selecione exatamente uma sala.",
          path: ["salas"],
        });
      if (v.valorCentavos == null)
        ctx.addIssue({
          code: "custom",
          message: "Informe o valor mensal.",
          path: ["valorCentavos"],
        });
      if (v.diasNoMes == null)
        ctx.addIssue({
          code: "custom",
          message: "Informe a quantidade de dias no mês.",
          path: ["diasNoMes"],
        });
      if (!v.periodo)
        ctx.addIssue({
          code: "custom",
          message: "Selecione o período.",
          path: ["periodo"],
        });
    }
    if (v.tipo === "evento_privativo") {
      if (v.valorCentavos == null)
        ctx.addIssue({
          code: "custom",
          message: "Informe o valor do evento privativo.",
          path: ["valorCentavos"],
        });
      if (!v.periodo)
        ctx.addIssue({
          code: "custom",
          message: "Selecione o horário (período).",
          path: ["periodo"],
        });
    }
  });

export type ComboInput = z.infer<typeof comboSchema>;
