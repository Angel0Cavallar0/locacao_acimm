import { z } from "zod";

/** Schemas Zod compartilhados do fluxo de auth do colaborador (Spec 03). */

export const loginSchema = z.object({
  email: z.email("Informe um e-mail válido"),
  senha: z.string().min(1, "Informe a senha"),
});

export const emailSchema = z.object({
  email: z.email("Informe um e-mail válido"),
});

export const definirSenhaSchema = z
  .object({
    senha: z.string().min(10, "A senha deve ter ao menos 10 caracteres"),
    confirmacao: z.string(),
  })
  .refine((d) => d.senha === d.confirmacao, {
    message: "As senhas não conferem",
    path: ["confirmacao"],
  });

export const roleColaboradorSchema = z.enum(["admin", "colaborador"]);

export const convidarColaboradorSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome"),
  email: z.email("Informe um e-mail válido"),
  role: roleColaboradorSchema,
});
