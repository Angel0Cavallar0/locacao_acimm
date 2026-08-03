import { z } from "zod";
import { periodoSchema } from "@/lib/validacoes/salas";

/** Schemas Zod das operações de locação (Spec 06). */

export const statusLocacaoSchema = z.enum([
  "rascunho",
  "solicitada",
  "em_analise",
  "aprovada",
  "contrato_enviado",
  "contrato_assinado",
  "aguardando_pagamento",
  "confirmada",
  "realizada",
  "finalizada",
  "recusada",
  "cancelada",
]);

export const transicaoSchema = z.object({
  locacaoId: z.uuid(),
  para: statusLocacaoSchema,
  motivo: z.string().trim().max(500).optional(),
  observacao: z.string().trim().max(500).optional(),
});

export const reagendarSchema = z
  .object({
    locacaoId: z.uuid(),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    horaInicio: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida"),
    horaFim: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida"),
    periodo: periodoSchema,
    salaIds: z.array(z.uuid()).min(1, "Selecione ao menos uma sala"),
    // Colaborador confirmou a sobreposição no novo slot (Spec 31 §7).
    sobreposicaoAutorizada: z.boolean().optional().default(false),
  })
  .refine((v) => v.horaFim > v.horaInicio, {
    message: "A hora de fim deve ser maior que a de início.",
    path: ["horaFim"],
  });

export const adicionalSchema = z.object({
  descricao: z.string().trim().min(1, "Informe a descrição").max(200),
  quantidade: z.coerce.number().positive("Quantidade deve ser positiva"),
  valorUnitarioCentavos: z.coerce
    .number()
    .int()
    .min(0, "Valor não pode ser negativo"),
  // Item do catálogo de serviços (Ciclo 2/Spec 30); ausente = texto livre.
  servicoAdicionalId: z.string().uuid().nullable().optional(),
});

export type TransicaoInput = z.infer<typeof transicaoSchema>;
export type ReagendarInput = z.infer<typeof reagendarSchema>;
export type AdicionalInput = z.infer<typeof adicionalSchema>;
