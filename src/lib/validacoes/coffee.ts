import { z } from "zod";

/** Schemas Zod de coffee break (Spec 08): níveis e coffee da locação. */

export const itemComposicaoSchema = z.object({
  item: z.string().trim().min(1, "Informe o item").max(120),
  qtd: z.coerce
    .number()
    .min(0, "Quantidade inválida")
    .max(1000000, "Quantidade muito alta"),
  unidade: z.string().trim().min(1, "Informe a unidade").max(16),
});

export const faixaPrecoSchema = z
  .object({
    minPessoas: z.coerce.number().int().min(1, "Mínimo inválido"),
    maxPessoas: z.coerce
      .number()
      .int()
      .min(1)
      .nullable()
      .optional()
      .default(null),
    valorPessoaCentavos: z.coerce
      .number()
      .int("Valor inválido")
      .min(0, "Valor não pode ser negativo"),
  })
  .refine((f) => f.maxPessoas === null || f.maxPessoas >= f.minPessoas, {
    message: "O máximo deve ser maior ou igual ao mínimo.",
    path: ["maxPessoas"],
  });

export const adicionalCoffeeSchema = z.object({
  descricao: z.string().trim().min(1).max(160),
  valorCentavos: z.coerce.number().int().min(0),
});

export const nivelCoffeeSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome").max(80),
  descricao: z.string().trim().max(2000).optional().default(""),
  faixasPreco: z
    .array(faixaPrecoSchema)
    .min(1, "Cadastre ao menos uma faixa de preço.")
    .max(20),
  composicao: z.array(itemComposicaoSchema).max(60).default([]),
  adicionais: z.array(adicionalCoffeeSchema).max(30).default([]),
  ativo: z.boolean().default(true),
});

export type NivelCoffeeInput = z.infer<typeof nivelCoffeeSchema>;

/** Coffee no detalhe da locação — `coffeeId` presente = edição. */
export const coffeeLocacaoSchema = z.object({
  locacaoId: z.uuid(),
  coffeeId: z.uuid().optional(),
  nivelId: z.uuid("Selecione o nível"),
  qtdPessoas: z.coerce.number().int().min(1, "Informe o nº de pessoas"),
  /** "HH:mm" no fuso de SP, ou vazio para não definir. */
  horarioServir: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Horário inválido")
    .optional()
    .or(z.literal("")),
  adicionais: z.array(adicionalCoffeeSchema).max(30).default([]),
  observacoes: z.string().trim().max(2000).optional().default(""),
});

export type CoffeeLocacaoInput = z.infer<typeof coffeeLocacaoSchema>;

export const intervaloCoffeeSchema = z
  .object({
    inicioData: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inicial inválida"),
    fimData: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data final inválida"),
    incluirPendentes: z.boolean().default(false),
  })
  .refine((v) => v.inicioData <= v.fimData, {
    message: "A data inicial deve ser anterior à final.",
    path: ["fimData"],
  })
  .refine(
    (v) => {
      const dias =
        (Date.parse(`${v.fimData}T00:00:00Z`) -
          Date.parse(`${v.inicioData}T00:00:00Z`)) /
          86_400_000 +
        1;
      return dias <= 31;
    },
    { message: "O intervalo máximo é de 31 dias.", path: ["fimData"] },
  );
