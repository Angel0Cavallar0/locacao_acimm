import { z } from "zod";

/** Schemas Zod das operações de pagamento (Spec 14 §4). */

export const formaPagamentoSchema = z.enum([
  "pix",
  "transferencia",
  "boleto_avulso",
  "boleto_mensalidade",
  "isento",
]);

export const darBaixaSchema = z.object({
  pagamentoId: z.uuid(),
  /** Data efetiva do pagamento (YYYY-MM-DD, SP). Vazio = agora. Não-futura. */
  dataEfetiva: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
    .optional(),
  observacao: z.string().trim().max(300).optional(),
});

export const estornarSchema = z.object({
  pagamentoId: z.uuid(),
  motivo: z.string().trim().min(1, "Informe o motivo do estorno").max(300),
});

export const itemRecomposicaoSchema = z.object({
  descricao: z.string().trim().min(1, "Informe a descrição").max(200),
  forma: formaPagamentoSchema,
  valorCentavos: z.coerce.number().int().min(0, "Valor não pode ser negativo"),
  observacao: z.string().trim().max(300).optional(),
});

export const recomporSchema = z.object({
  locacaoId: z.uuid(),
  itens: z
    .array(itemRecomposicaoSchema)
    .min(1, "Adicione ao menos um pagamento")
    .max(20, "Máximo de 20 pagamentos"),
});

export type DarBaixaInput = z.infer<typeof darBaixaSchema>;
export type EstornarInput = z.infer<typeof estornarSchema>;
export type RecomporInput = z.infer<typeof recomporSchema>;
export type ItemRecomposicao = z.infer<typeof itemRecomposicaoSchema>;
