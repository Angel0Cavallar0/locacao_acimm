import { z } from "zod";

/** Schemas Zod do fluxo de auth do associado (Spec 09). */

export const loginAssociadoSchema = z.object({
  documento: z.string().min(1, "Informe o documento"),
  email: z.email("Informe um e-mail válido"),
  senha: z.string().min(1, "Informe a senha"),
});

export const documentoSchema = z.object({
  documento: z.string().min(1, "Informe o documento"),
});

export const codigoSchema = z.object({
  codigo: z.string().regex(/^\d{6}$/, "O código tem 6 dígitos"),
});

export const senhaAssociadoSchema = z
  .object({
    senha: z.string().min(10, "A senha deve ter ao menos 10 caracteres"),
    confirmacao: z.string(),
  })
  .refine((d) => d.senha === d.confirmacao, {
    message: "As senhas não conferem",
    path: ["confirmacao"],
  });
