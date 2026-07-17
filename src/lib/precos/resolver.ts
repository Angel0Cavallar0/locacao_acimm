import "server-only";
import type { CondicaoLocatario, PeriodoDia } from "@/lib/dominio";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type CandidatoPreco,
  dataLocalSaoPaulo,
  parseDaterange,
  selecionarPreco,
} from "./resolver-core";

/**
 * ÚNICA fonte de preço do sistema (Spec 04 §5). Specs 07/11 proíbem qualquer
 * outra forma de obter o valor de uma sala. Usa service role para ler o preço
 * autoritativo (independe do RLS do chamador).
 */
export type ResultadoPreco =
  | { valorCentavos: number; precoId: string }
  | { erro: "sem_preco" };

export async function resolverPreco(input: {
  salaId: string;
  data: Date;
  periodo: PeriodoDia;
  condicao: CondicaoLocatario;
}): Promise<ResultadoPreco> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("precos_sala")
    .select("id, valor_centavos, dias_semana, vigencia")
    .eq("sala_id", input.salaId)
    .eq("periodo", input.periodo)
    .eq("condicao", input.condicao);

  if (error || !data) return { erro: "sem_preco" };

  const candidatos: CandidatoPreco[] = data.map((r) => {
    const { inicio, fim } = parseDaterange(String(r.vigencia));
    return {
      id: r.id as string,
      valorCentavos: r.valor_centavos as number,
      diasSemana: (r.dias_semana ?? []) as number[],
      vigenciaInicio: inicio,
      vigenciaFim: fim,
    };
  });

  const escolhido = selecionarPreco(candidatos, dataLocalSaoPaulo(input.data));
  if (!escolhido) return { erro: "sem_preco" };

  return { valorCentavos: escolhido.valorCentavos, precoId: escolhido.id };
}
