import { z } from "zod";

/** Validação do editor de formulário (Spec 22 §2). */

const rotulo = z.string().trim().min(1, "Informe o rótulo.").max(120);
const opcoes = z.array(z.string().trim().max(120)).max(50).default([]);

// Tipo só existe na CRIAÇÃO — é imutável depois (§2).
const tipoCampo = z.enum([
  "texto",
  "texto_longo",
  "numero",
  "selecao",
  "multiselecao",
  "booleano",
  "data",
]);

export const criarCampoSchema = z.object({
  rotulo,
  tipo: tipoCampo,
  opcoes,
  obrigatorio: z.boolean().default(false),
  ativo: z.boolean().default(true),
});

export const editarCampoSchema = z.object({
  id: z.uuid(),
  rotulo,
  opcoes,
  obrigatorio: z.boolean(),
  ativo: z.boolean(),
});

export const reordenarCampoSchema = z.object({
  id: z.uuid(),
  direcao: z.enum(["cima", "baixo"]),
});

export const alternarAtivoSchema = z.object({
  id: z.uuid(),
  ativo: z.boolean(),
});

export type CriarCampoInput = z.infer<typeof criarCampoSchema>;
export type EditarCampoInput = z.infer<typeof editarCampoSchema>;
