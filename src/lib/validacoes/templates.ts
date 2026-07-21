import { z } from "zod";

/** Validação do editor de templates de mensagem (Spec 25 §C). */

export const salvarTemplateSchema = z.object({
  chave: z.string().trim().min(1),
  ativo: z.boolean(),
  whatsapp: z.string().max(2000).default(""),
  emailAssunto: z.string().max(300).default(""),
  emailCorpo: z.string().max(5000).default(""),
});

export type SalvarTemplateInput = z.infer<typeof salvarTemplateSchema>;
