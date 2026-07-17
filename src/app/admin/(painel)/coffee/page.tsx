import type { Metadata } from "next";
import { requireColaborador } from "@/lib/auth/guards";
import { carregarPedidosCoffee } from "@/lib/coffee/dados";
import { hojeSP, intervaloSemana } from "@/lib/coffee/periodo";
import { CoffeeClient } from "./coffee-client";

export const metadata: Metadata = { title: "Coffee Break" };

export default async function CoffeePage() {
  await requireColaborador();

  const hoje = hojeSP();
  const intervalo = intervaloSemana(hoje);
  const { pedidos, consolidado } = await carregarPedidosCoffee(intervalo, false);

  return (
    <CoffeeClient
      hojeISO={hoje}
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
