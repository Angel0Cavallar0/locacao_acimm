import { z } from "zod";

/** Validações de pendência de locação sem data. */

export const adicionarPendenciaSchema = z.object({
  associadoId: z.uuid().nullable(),
  nome: z.string().trim().min(2, "Informe o nome do interessado."),
  contato: z.string().trim().min(3, "Informe um contato."),
  motivo: z.string().trim().max(300).optional(),
  observacoes: z.string().trim().max(500).optional(),
});

export const arquivarPendenciaSchema = z.object({
  id: z.uuid(),
  motivo: z.string().trim().max(200).optional(),
});

export type AdicionarPendenciaInput = z.infer<typeof adicionarPendenciaSchema>;
export type ArquivarPendenciaInput = z.infer<typeof arquivarPendenciaSchema>;
