import { z } from "zod";
import { apenasDigitos, documentoValido } from "@/lib/utils/documento";
import { condicaoSchema, periodoSchema } from "@/lib/validacoes/salas";

/** Payload da criação assistida (Spec 07 §5). Não carrega nenhum preço/total —
 * o servidor recalcula tudo via calcularValores(); valores forjados no client
 * não têm onde entrar. */

const coffeeSchema = z.object({
  nivelId: z.uuid(),
  qtdPessoas: z.coerce.number().int().positive(),
  horarioServir: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .default(null),
  adicionais: z
    .array(
      z.object({
        descricao: z.string().trim().min(1).max(200),
        valorCentavos: z.number().int().min(0),
      }),
    )
    .default([]),
  observacoes: z.string().trim().max(1000).optional().default(""),
});

const adicionalSchema = z.object({
  descricao: z.string().trim().min(1, "Informe a descrição").max(200),
  quantidade: z.coerce.number().positive(),
  valorUnitarioCentavos: z.number().int().min(0),
});

export const criarLocacaoSchema = z
  .object({
    condicao: condicaoSchema,
    associadoId: z.uuid().nullable().default(null),
    locatarioNome: z.string().trim().min(1, "Informe o nome").max(200),
    locatarioDocumento: z
      .string()
      .transform(apenasDigitos)
      .refine(documentoValido, "CPF/CNPJ inválido"),
    locatarioEmail: z.email("E-mail inválido"),
    locatarioTelefone: z.string().trim().min(8, "Telefone inválido").max(20),
    responsavelNome: z.string().trim().min(1, "Informe o responsável").max(200),
    salaIds: z.array(z.uuid()).min(1, "Selecione ao menos uma sala"),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    periodo: periodoSchema,
    horaInicio: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida"),
    horaFim: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida"),
    qtdPessoas: z.coerce.number().int().positive("Informe o nº de pessoas"),
    tipoEvento: z.string().trim().max(200).optional().default(""),
    observacoes: z.string().trim().max(2000).optional().default(""),
    respostasFormulario: z.record(z.string(), z.unknown()).default({}),
    coffee: coffeeSchema.nullable().default(null),
    adicionais: z.array(adicionalSchema).default([]),
    formaPagamento: z
      .enum([
        "pix",
        "transferencia",
        "boleto_avulso",
        "boleto_mensalidade",
        "isento",
      ])
      .nullable()
      .default(null),
    aprovar: z.boolean().default(false),
  })
  .refine((v) => v.horaFim > v.horaInicio, {
    message: "A hora de fim deve ser maior que a de início.",
    path: ["horaFim"],
  })
  .refine((v) => v.condicao !== "associado" || v.associadoId !== null, {
    message: "Selecione o associado.",
    path: ["associadoId"],
  });

export type CriarLocacaoInput = z.infer<typeof criarLocacaoSchema>;
