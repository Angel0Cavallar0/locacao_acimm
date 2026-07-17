import { z } from "zod";

/** Schemas Zod do calendário consolidado (Spec 05 §3 e §6). */

const MAX_DIAS_RANGE = 62;

/**
 * Range de consulta da agenda. Limite de 62 dias por chamada (§3) — protege
 * o servidor de varreduras enormes vindas de um range manipulado no client.
 */
export const rangeAgendaSchema = z
  .object({
    inicio: z.string().datetime({ offset: true }),
    fim: z.string().datetime({ offset: true }),
  })
  .refine((r) => new Date(r.fim) > new Date(r.inicio), {
    message: "Range inválido: fim deve ser depois do início.",
    path: ["fim"],
  })
  .refine(
    (r) => {
      const dias =
        (new Date(r.fim).getTime() - new Date(r.inicio).getTime()) / 86_400_000;
      return dias <= MAX_DIAS_RANGE;
    },
    { message: `Consulta limitada a ${MAX_DIAS_RANGE} dias.`, path: ["fim"] },
  );

export type RangeAgendaInput = z.infer<typeof rangeAgendaSchema>;

/**
 * Novo bloqueio manual de sala. `diaInteiro` dispensa horários; caso contrário
 * exige início e fim válidos. Os campos de data vêm como "wall time" de São
 * Paulo ('YYYY-MM-DD' / 'HH:mm') e são convertidos para UTC na server action.
 */
export const bloqueioSchema = z
  .object({
    salaId: z.uuid(),
    data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida"),
    diaInteiro: z.boolean().default(false),
    horaInicio: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Hora inválida")
      .optional(),
    horaFim: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Hora inválida")
      .optional(),
    motivo: z.string().trim().min(1, "Informe o motivo").max(300),
  })
  .superRefine((v, ctx) => {
    if (v.diaInteiro) return;
    if (!v.horaInicio)
      ctx.addIssue({
        code: "custom",
        message: "Informe a hora de início.",
        path: ["horaInicio"],
      });
    if (!v.horaFim)
      ctx.addIssue({
        code: "custom",
        message: "Informe a hora de fim.",
        path: ["horaFim"],
      });
    if (v.horaInicio && v.horaFim && v.horaFim <= v.horaInicio)
      ctx.addIssue({
        code: "custom",
        message: "A hora de fim deve ser maior que a de início.",
        path: ["horaFim"],
      });
  });

export type BloqueioInput = z.infer<typeof bloqueioSchema>;
