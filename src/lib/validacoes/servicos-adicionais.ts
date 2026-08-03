import { z } from "zod";

/** Validações do catálogo de serviços adicionais (Ciclo 2 / Spec 30 §2). */

export const MODELOS_COBRANCA = [
  "por_unidade",
  "fixo_evento",
  "sob_consulta",
] as const;

export const servicoAdicionalSchema = z
  .object({
    nome: z.string().trim().min(1, "Informe o nome.").max(120),
    descricao: z.string().trim().max(2000).nullable().default(null),
    modeloCobranca: z.enum(MODELOS_COBRANCA),
    unidade: z.string().trim().max(40).nullable().default(null),
    valorUnitarioCentavos: z
      .number()
      .int()
      .min(0, "Valor não pode ser negativo.")
      .nullable()
      .default(null),
    salaId: z.string().uuid().nullable().default(null),
    requerAprovacao: z.boolean().default(false),
    sujeitoDisponibilidade: z.boolean().default(false),
    ativo: z.boolean().default(true),
  })
  .refine(
    (v) =>
      v.modeloCobranca === "sob_consulta"
        ? v.valorUnitarioCentavos == null
        : v.valorUnitarioCentavos != null,
    {
      message:
        "Modelos por unidade e fixo exigem valor; sob consulta não tem valor.",
      path: ["valorUnitarioCentavos"],
    },
  );

export type ServicoAdicionalInput = z.infer<typeof servicoAdicionalSchema>;
