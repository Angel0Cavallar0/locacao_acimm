import "server-only";
import { spWallParaUtc } from "@/lib/calendario/tempo";
import type { CondicaoLocatario, PeriodoDia } from "@/lib/dominio";
import { resolverPreco } from "@/lib/precos/resolver";
import { createAdminClient } from "@/lib/supabase/admin";
import { somarAdicionais, totalCoffee, totalGeral } from "./calcular-core";

/**
 * ÚNICA fonte de cálculo de valores da locação (Spec 07 §4). O client nunca
 * calcula preço: o valor da sala vem de resolverPreco() e o valor por pessoa
 * do coffee de coffee_niveis. Os adicionais (locação e coffee) são valores
 * manuais digitados pelo colaborador (como "hora extra R$45"), então entram
 * como informados — a aritmética é sempre refeita aqui. Spec 11 reutiliza.
 */

export interface EntradaCalculo {
  salaIds: string[];
  /** Data do evento 'YYYY-MM-DD' (São Paulo). */
  data: string;
  periodo: PeriodoDia;
  condicao: CondicaoLocatario;
  coffee: {
    nivelId: string;
    qtdPessoas: number;
    adicionaisCentavos: number;
  } | null;
  adicionais: { quantidade: number; valorUnitarioCentavos: number }[];
}

export interface ResultadoCalculo {
  salas: { salaId: string; valorCentavos: number; semPreco: boolean }[];
  salasSemPreco: string[];
  salasCentavos: number;
  coffeeCentavos: number;
  adicionaisCentavos: number;
  descontosCentavos: number;
  totalCentavos: number;
}

export async function calcularValores(
  input: EntradaCalculo,
): Promise<ResultadoCalculo> {
  // Meio-dia SP: garante data e dia-da-semana corretos independentemente da hora.
  const dataEvento = new Date(spWallParaUtc(input.data, "12:00"));

  const salas: { salaId: string; valorCentavos: number; semPreco: boolean }[] =
    [];
  let salasCentavos = 0;
  for (const salaId of input.salaIds) {
    const preco = await resolverPreco({
      salaId,
      data: dataEvento,
      periodo: input.periodo,
      condicao: input.condicao,
    });
    if ("erro" in preco) {
      salas.push({ salaId, valorCentavos: 0, semPreco: true });
    } else {
      salas.push({ salaId, valorCentavos: preco.valorCentavos, semPreco: false });
      salasCentavos += preco.valorCentavos;
    }
  }
  const salasSemPreco = salas.filter((s) => s.semPreco).map((s) => s.salaId);

  let coffeeCentavos = 0;
  if (input.coffee) {
    const admin = createAdminClient();
    const { data: nivel } = await admin
      .from("coffee_niveis")
      .select("valor_pessoa_centavos")
      .eq("id", input.coffee.nivelId)
      .maybeSingle();
    coffeeCentavos = totalCoffee(
      (nivel?.valor_pessoa_centavos as number) ?? 0,
      input.coffee.qtdPessoas,
      input.coffee.adicionaisCentavos,
    );
  }

  const adicionaisCentavos = somarAdicionais(input.adicionais);
  const descontosCentavos = 0; // Spec 20
  const totalCentavos = totalGeral({
    salasCentavos,
    coffeeCentavos,
    adicionaisCentavos,
    descontosCentavos,
  });

  return {
    salas,
    salasSemPreco,
    salasCentavos,
    coffeeCentavos,
    adicionaisCentavos,
    descontosCentavos,
    totalCentavos,
  };
}
