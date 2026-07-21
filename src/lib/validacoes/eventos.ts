import { z } from "zod";

/** Schemas Zod dos eventos internos (Spec 17). */

export const prioridadeEventoSchema = z.enum(["alta", "media", "baixa"]);

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");
const horaHM = z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida");

const eventoBase = z
  .object({
    titulo: z.string().trim().min(1, "Informe o título").max(200),
    descricao: z.string().trim().max(2000).optional(),
    salaId: z.uuid(),
    data: dataISO,
    horaInicio: horaHM,
    horaFim: horaHM,
    prioridade: prioridadeEventoSchema,
  })
  .refine((v) => v.horaFim > v.horaInicio, {
    message: "A hora de fim deve ser maior que a de início.",
    path: ["horaFim"],
  });

export const criarEventoSchema = z.intersection(
  eventoBase,
  z.object({
    /** Recorrência semanal opcional: cria ocorrências até esta data (inclusive). */
    repetirSemanalAte: dataISO.optional(),
    /** Vínculo Sympla opcional já na criação (§5). */
    symplaEventId: z.string().trim().min(1).max(64).optional(),
    symplaUrl: z.string().trim().url().max(500).optional(),
  }),
);

export const editarEventoSchema = z.intersection(
  eventoBase,
  z.object({ eventoId: z.uuid() }),
);

export const moverSalaSchema = z.object({
  eventoId: z.uuid(),
  salaId: z.uuid(),
});

export const vincularSymplaSchema = z.object({
  eventoId: z.uuid(),
  symplaEventId: z.string().trim().min(1).max(64),
  symplaUrl: z.string().trim().url().max(500).optional(),
});

export type CriarEventoInput = z.infer<typeof criarEventoSchema>;
export type EditarEventoInput = z.infer<typeof editarEventoSchema>;
export type MoverSalaInput = z.infer<typeof moverSalaSchema>;
export type VincularSymplaInput = z.infer<typeof vincularSymplaSchema>;
