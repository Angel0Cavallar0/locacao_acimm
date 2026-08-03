import { z } from "zod";
import { apenasDigitos, documentoValido } from "@/lib/utils/documento";
import { periodoSchema } from "@/lib/validacoes/salas";

/**
 * Solicitação de locação pelo associado (Spec 11 §5). Diferenças deliberadas
 * do fluxo assistido (§2): condição é SEMPRE `associado` (o servidor força),
 * SEM adicionais de locação nem de coffee, período fechado (horário derivado
 * do período, não editável), e "Isento" NÃO é uma forma aceita pelo portal.
 * Nenhum preço/total trafega no payload — o servidor recalcula via
 * `calcularValores()`.
 */

const coffeeSolicitacaoSchema = z.object({
  nivelId: z.uuid(),
  qtdPessoas: z.coerce.number().int().positive(),
  horarioServir: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .default(null),
  // Adicionais escolhidos do catálogo do nível (valor fixo por item).
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

export const criarSolicitacaoSchema = z
  .object({
    salaIds: z.array(z.uuid()).min(1, "Selecione ao menos uma sala").max(20),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    periodo: periodoSchema,
    // Locação em nome de terceiro (§4 etapa 2 / CLAUDE.md §8.6).
    terceiro: z.boolean().default(false),
    // Contato do associado (usado quando NÃO é terceiro).
    emailContato: z.email("E-mail inválido"),
    telefoneContato: z.string().trim().min(8, "Telefone inválido").max(20),
    // Responsável/signatário da locação (Spec 13 §0.3) — obrigatório.
    responsavelNome: z.string().trim().min(1, "Informe o responsável").max(200),
    // Dados do locatário terceiro (validados só quando `terceiro`).
    terceiroNome: z.string().trim().max(200).optional().default(""),
    terceiroDocumento: z.string().optional().default(""),
    terceiroEmail: z.string().optional().default(""),
    terceiroTelefone: z.string().optional().default(""),
    qtdPessoas: z.coerce.number().int().positive("Informe o nº de pessoas"),
    tipoEvento: z.string().trim().max(200).optional().default(""),
    observacoes: z.string().trim().max(2000).optional().default(""),
    respostasFormulario: z.record(z.string(), z.unknown()).default({}),
    coffee: coffeeSolicitacaoSchema.nullable().default(null),
    // Serviços adicionais do catálogo (Ciclo 2/Spec 30) — sem sob consulta no
    // portal; o valor é recalculado no servidor a partir do catálogo.
    adicionais: z
      .array(
        z.object({
          servicoAdicionalId: z.string().uuid(),
          quantidade: z.coerce.number().positive().default(1),
        }),
      )
      .max(20)
      .default([]),
    // "isento" fica FORA do enum de propósito — isenção é decisão da ACIMM.
    formaPagamento: z
      .enum(["pix", "transferencia", "boleto_avulso", "boleto_mensalidade"])
      .nullable()
      .default(null),
    // Sócio pode recusar o período gratuito, guardando o uso (Spec 20 §5.3).
    periodoGratuitoRecusado: z.boolean().optional().default(false),
    // Combo selecionado (Spec 20 §3) — exclusivo de sócio; revalidado no servidor.
    comboId: z.uuid().nullable().default(null),
  })
  .superRefine((v, ctx) => {
    if (!v.terceiro) return;
    if (v.terceiroNome.trim().length < 1) {
      ctx.addIssue({
        code: "custom",
        message: "Informe o nome do locatário.",
        path: ["terceiroNome"],
      });
    }
    if (!documentoValido(apenasDigitos(v.terceiroDocumento))) {
      ctx.addIssue({
        code: "custom",
        message: "CPF/CNPJ do locatário inválido.",
        path: ["terceiroDocumento"],
      });
    }
    if (!z.email().safeParse(v.terceiroEmail.trim()).success) {
      ctx.addIssue({
        code: "custom",
        message: "E-mail do locatário inválido.",
        path: ["terceiroEmail"],
      });
    }
    if (v.terceiroTelefone.trim().length < 8) {
      ctx.addIssue({
        code: "custom",
        message: "Telefone do locatário inválido.",
        path: ["terceiroTelefone"],
      });
    }
  });

export type CriarSolicitacaoInput = z.infer<typeof criarSolicitacaoSchema>;
