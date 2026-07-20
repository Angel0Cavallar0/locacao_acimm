import { z } from "zod";

/** Schemas Zod da disponibilidade do portal (Spec 10). */

export const filtrosDisponibilidadeSchema = z.object({
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  salaIds: z.array(z.uuid()).max(60).default([]),
  capacidadeMin: z.coerce.number().int().min(0).max(100000).default(0),
});

export const filaEsperaSchema = z.object({
  salaId: z.uuid(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  nome: z.string().trim().min(1, "Informe o nome").max(200),
  contato: z.string().trim().min(1, "Informe um contato").max(120),
});
