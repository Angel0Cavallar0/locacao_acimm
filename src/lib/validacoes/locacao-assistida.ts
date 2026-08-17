import { z } from "zod";
import { apenasDigitos, documentoValido } from "@/lib/utils/documento";
import { condicaoSchema, periodoSchema } from "@/lib/validacoes/salas";

/** Payload da criação assistida (Spec 07 §5). O servidor recalcula tudo via
 * calcularValores() — coffee, adicionais, combo, período gratuito e o total
 * nunca vêm prontos do client. Exceção deliberada (Spec 34): o valor de cada
 * sala pode ser confirmado/sobrescrito pelo colaborador
 * (valoresManuaisPorSala) e um desconto manual pode ser aplicado
 * (descontoManual) — só neste fluxo (sempre atrás de requireColaborador());
 * o portal do associado (validacoes/solicitacao.ts) NUNCA recebe esses
 * campos. */

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
  descricao: z.string().trim().max(200).default(""),
  quantidade: z.coerce.number().positive(),
  valorUnitarioCentavos: z.number().int().min(0),
  // Item do catálogo (Ciclo 2/Spec 30); ausente = texto livre.
  servicoAdicionalId: z.string().uuid().nullable().optional(),
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
        "cartao",
        "dinheiro",
        "boleto_avulso",
        "boleto_mensalidade",
        "isento",
      ])
      .nullable()
      .default(null),
    aprovar: z.boolean().default(false),
    filaEsperaId: z.uuid().nullable().default(null),
    periodoGratuitoRecusado: z.boolean().optional().default(false),
    comboId: z.uuid().nullable().default(null),
    // Sobreposição autorizada por colaborador (Spec 31 §7): permite gravar
    // sobre uma sala/horário já ocupado por outra locação.
    sobreposicaoAutorizada: z.boolean().optional().default(false),
    // Lançamento retroativo (Spec 31 §6): evento passado, sem automações.
    retroativa: z.boolean().optional().default(false),
    // Valor final por sala confirmado/sobrescrito pelo colaborador (Spec 34).
    valoresManuaisPorSala: z
      .record(z.string().uuid(), z.number().int().min(0).max(100_000_000))
      .optional()
      .default({}),
    // Desconto manual — percentual (0–100) ou valor fixo em centavos (Spec 34).
    descontoManual: z
      .object({
        tipo: z.enum(["percentual", "valor"]),
        valor: z.number().positive(),
        motivo: z.string().trim().max(300).optional(),
      })
      .nullable()
      .optional()
      .default(null),
  })
  .refine((v) => v.horaFim > v.horaInicio, {
    message: "A hora de fim deve ser maior que a de início.",
    path: ["horaFim"],
  })
  .refine((v) => v.condicao !== "associado" || v.associadoId !== null, {
    message: "Selecione o associado.",
    path: ["associadoId"],
  })
  .refine(
    (v) => v.descontoManual?.tipo !== "percentual" || v.descontoManual.valor <= 100,
    {
      message: "O desconto percentual não pode passar de 100%.",
      path: ["descontoManual", "valor"],
    },
  )
  .refine(
    (v) =>
      v.descontoManual?.tipo !== "valor" || Number.isInteger(v.descontoManual.valor),
    {
      message: "O valor do desconto deve ser um número inteiro de centavos.",
      path: ["descontoManual", "valor"],
    },
  );

export type CriarLocacaoInput = z.infer<typeof criarLocacaoSchema>;
