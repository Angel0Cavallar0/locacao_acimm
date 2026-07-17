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
});

export type PrecoInput = z.infer<typeof precoSchema>;
