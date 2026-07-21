import { z } from "zod";

/** Validação das regras de período gratuito (Spec 20 §5.1). */

const periodoEnum = z.enum(["manha", "tarde", "noite", "dia_inteiro"]);

export const criarRegraGratuitoSchema = z.object({
  salaId: z.uuid("Selecione a sala."),
  periodos: z.array(periodoEnum).min(1, "Escolha ao menos um período."),
  usosPorCiclo: z.coerce.number().int().min(1, "Mínimo 1 uso.").max(31),
});

export const editarRegraGratuitoSchema = z.object({
  id: z.uuid(),
  periodos: z.array(periodoEnum).min(1, "Escolha ao menos um período."),
  usosPorCiclo: z.coerce.number().int().min(1, "Mínimo 1 uso.").max(31),
  ativo: z.boolean(),
});

export type CriarRegraGratuitoInput = z.infer<typeof criarRegraGratuitoSchema>;
export type EditarRegraGratuitoInput = z.infer<typeof editarRegraGratuitoSchema>;
