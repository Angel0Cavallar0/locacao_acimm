"use server";

import {
  type ResultadoTemplate,
  salvarTemplate,
} from "@/lib/notificacoes/templates-gestao";
import type { SalvarTemplateInput } from "@/lib/validacoes/templates";

export async function salvarTemplateAction(
  input: SalvarTemplateInput,
): Promise<ResultadoTemplate> {
  return salvarTemplate(input);
}
