"use server";

import { requireColaborador } from "@/lib/auth/guards";
import { carregarPedidosCoffee } from "@/lib/coffee/dados";
import { intervaloDeDatas } from "@/lib/coffee/periodo";
import { gerarPdfCompras } from "@/lib/coffee/pdf-compras";
import type { ConsolidadoCompras, PedidoCoffee } from "@/lib/coffee/tipos";
import { intervaloCoffeeSchema } from "@/lib/validacoes/coffee";

export interface PedidosResposta {
  pedidos: PedidoCoffee[];
  consolidado: ConsolidadoCompras;
  intervalo: { inicioData: string; fimData: string; rotulo: string };
  incluirPendentes: boolean;
}

export async function listarPedidosAction(input: {
  inicioData: string;
  fimData: string;
  incluirPendentes: boolean;
}): Promise<PedidosResposta | { error: string }> {
  await requireColaborador();
  const parsed = intervaloCoffeeSchema.safeParse(input);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Período inválido." };
  }
  const intervalo = intervaloDeDatas(parsed.data.inicioData, parsed.data.fimData);
  const { pedidos, consolidado } = await carregarPedidosCoffee(
    intervalo,
    parsed.data.incluirPendentes,
  );
  return {
    pedidos,
    consolidado,
    intervalo: {
      inicioData: intervalo.inicioData,
      fimData: intervalo.fimData,
      rotulo: intervalo.rotulo,
    },
    incluirPendentes: parsed.data.incluirPendentes,
  };
}

export async function gerarPdfComprasAction(input: {
  inicioData: string;
  fimData: string;
}): Promise<{ base64: string; nome: string } | { error: string }> {
  await requireColaborador();
  const parsed = intervaloCoffeeSchema.safeParse({
    ...input,
    incluirPendentes: false,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Período inválido." };
  }
  const intervalo = intervaloDeDatas(parsed.data.inicioData, parsed.data.fimData);
  const buffer = await gerarPdfCompras(intervalo);
  return {
    base64: buffer.toString("base64"),
    nome: `compras-coffee-${intervalo.inicioData}_a_${intervalo.fimData}.pdf`,
  };
}
