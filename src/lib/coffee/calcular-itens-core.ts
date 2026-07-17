import type {
  ConsolidadoCompras,
  ItemComposicao,
  ItemConsolidado,
} from "./tipos";

/**
 * Cálculo PURO do consolidado de compras (Spec 08 §4). Sem I/O — recebe os
 * pedidos já materializados e agrega por (item, unidade). A quantidade de cada
 * item é FIXA por pedido (não multiplica por pessoas). `qtdPessoas` é usado só
 * para o total de pessoas atendidas. Reutilizado pela tela e pelo PDF.
 */

export interface PedidoParaConsolidar {
  qtdPessoas: number;
  composicao: ItemComposicao[];
}

/**
 * Converte uma quantidade para uma unidade de exibição amigável:
 * ml → L e g → kg quando o total atinge 1000. Outras unidades passam direto.
 */
export function converterUnidade(
  qtd: number,
  unidade: string,
): { quantidade: number; unidade: string } {
  const u = unidade.trim().toLowerCase();
  if (u === "ml" && qtd >= 1000) return { quantidade: qtd / 1000, unidade: "L" };
  if (u === "g" && qtd >= 1000) return { quantidade: qtd / 1000, unidade: "kg" };
  return { quantidade: qtd, unidade: unidade.trim() };
}

/**
 * Agrega composição × pessoas de cada pedido por (item, unidade). A chave de
 * agregação usa item/unidade normalizados (minúsculas, sem espaços nas bordas)
 * ANTES da conversão de exibição — só o resultado final é convertido.
 */
export function calcularItensCoffee(
  pedidos: PedidoParaConsolidar[],
): ConsolidadoCompras {
  const mapa = new Map<
    string,
    { item: string; unidade: string; quantidade: number }
  >();
  let totalPessoas = 0;

  for (const p of pedidos) {
    const pessoas = Math.max(0, Math.trunc(p.qtdPessoas));
    totalPessoas += pessoas;
    for (const c of p.composicao) {
      const item = c.item.trim();
      const unidade = c.unidade.trim();
      if (!item) continue;
      const chave = `${item.toLowerCase()}|${unidade.toLowerCase()}`;
      // Quantidade fixa por pedido — não multiplica por pessoas.
      const inc = Math.max(0, c.qtd);
      const atual = mapa.get(chave);
      if (atual) atual.quantidade += inc;
      else mapa.set(chave, { item, unidade, quantidade: inc });
    }
  }

  const itens: ItemConsolidado[] = [...mapa.values()]
    .map((v) => {
      const conv = converterUnidade(v.quantidade, v.unidade);
      // Evita ruído de ponto flutuante (ex.: 3.5999999) no resultado.
      return {
        item: v.item,
        unidade: conv.unidade,
        quantidade: Math.round(conv.quantidade * 1000) / 1000,
      };
    })
    .sort((a, b) => a.item.localeCompare(b.item, "pt-BR"));

  return { itens, totalPessoas, qtdPedidos: pedidos.length };
}
