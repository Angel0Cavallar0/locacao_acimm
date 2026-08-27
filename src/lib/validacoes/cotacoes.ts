import { z } from "zod";
import { condicaoSchema, periodoSchema } from "@/lib/validacoes/salas";

/**
 * Validação da criação de cotação (orçamento pendente, NÃO reserva agenda —
 * decisão travada). A data é só referência para o cálculo (preço pode variar
 * por dia da semana/vigência) — criar uma cotação nunca checa disponibilidade
 * nem materializa agenda_ocupacoes.
 */

export const criarCotacaoSchema = z.object({
  condicao: condicaoSchema,
  associadoId: z.uuid().nullable().default(null),
  locatarioNome: z.string().trim().min(1, "Informe o nome").max(200),
  locatarioDocumento: z.string().trim().max(20).optional().default(""),
  locatarioEmail: z.string().trim().max(200).optional().default(""),
  locatarioTelefone: z.string().trim().max(20).optional().default(""),
  salaIds: z.array(z.uuid()).min(1, "Selecione ao menos uma sala"),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
  periodo: periodoSchema,
  qtdPessoas: z.coerce.number().int().positive("Informe o nº de pessoas"),
  coffee: z
    .object({
      nivelId: z.uuid(),
      qtdPessoas: z.coerce.number().int().positive(),
    })
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
});

export type CriarCotacaoInput = z.infer<typeof criarCotacaoSchema>;
