import type { Metadata } from "next";
import { requireColaborador } from "@/lib/auth/guards";
import { obterAntecedenciaCoffee } from "@/lib/coffee/config";
import { carregarPedidosCoffee } from "@/lib/coffee/dados";
import { hojeSP, intervaloSemana } from "@/lib/coffee/periodo";
import { CoffeeClient } from "./coffee-client";

export const metadata: Metadata = { title: "Coffee Break" };

export default async function CoffeePage() {
  await requireColaborador();

  const hoje = hojeSP();
  const intervalo = intervaloSemana(hoje);
  const [{ pedidos, consolidado }, antecedencia] = await Promise.all([
    carregarPedidosCoffee(intervalo, false),
    obterAntecedenciaCoffee(),
  ]);

  return (
    <CoffeeClient
      hojeISO={hoje}
      antecedenciaDias={antecedencia.dias}
      inicial={{
        pedidos,
        consolidado,
        intervalo: {
          inicioData: intervalo.inicioData,
          fimData: intervalo.fimData,
          rotulo: intervalo.rotulo,
        },
        incluirPendentes: false,
      }}
    />
  );
}
