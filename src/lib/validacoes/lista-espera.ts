import { z } from "zod";

/** Validações da lista de espera (Spec 19). */

const dataISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida.");

export const adicionarFilaSchema = z.object({
  // null = "qualquer sala".
  salaId: z.uuid("Sala inválida.").nullable(),
  data: dataISO,
  associadoId: z.uuid().nullable(),
  nome: z.string().trim().min(2, "Informe o nome do interessado."),
  contato: z.string().trim().min(3, "Informe um contato."),
  observacoes: z.string().trim().max(500).optional(),
});

export const arquivarFilaSchema = z.object({
  id: z.uuid(),
  motivo: z.string().trim().max(200).optional(),
});

export type AdicionarFilaInput = z.infer<typeof adicionarFilaSchema>;
export type ArquivarFilaInput = z.infer<typeof arquivarFilaSchema>;
