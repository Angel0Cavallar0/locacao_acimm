import type { StatusLocacao } from "@/lib/locacoes/maquina-estados-core";

/** Tipos e formatadores de coffee break (Spec 08), compartilhados server + client. */

/** Item do nível (base da lista de compras) — quantidade FIXA por pedido. */
export interface ItemComposicao {
  item: string;
  qtd: number;
  unidade: string;
}

/**
 * Faixa de preço por nº de pessoas. `valorPessoaCentavos` é POR PESSOA dentro
 * da faixa (total = valor × pessoas). `maxPessoas` nulo = faixa aberta (ex.:
 * "15 pessoas ou mais").
 */
export interface FaixaPreco {
  minPessoas: number;
  maxPessoas: number | null;
  valorPessoaCentavos: number;
}

/** Nível de coffee configurável (Bronze/Prata/Ouro… — nome livre). */
export interface NivelCoffee {
  id: string;
  nome: string;
  descricao: string | null;
  faixas: FaixaPreco[];
  composicao: ItemComposicao[];
  ativo: boolean;
  ordem: number;
}

/** Adicional livre de um coffee (texto + valor snapshot em centavos). */
export interface AdicionalCoffee {
  descricao: string;
  valorCentavos: number;
}

/**
 * Um pedido de coffee (uma linha de `coffee_breaks`) dentro do período
 * consultado. `firme` = status na cadeia aprovada→finalizada (entra no
 * consolidado e no PDF); pendentes só aparecem na tabela com destaque.
 */
export interface PedidoCoffee {
  coffeeId: string;
  locacaoId: string;
  numero: number;
  status: StatusLocacao;
  firme: boolean;
  inicioUtc: string;
  fimUtc: string;
  horarioServirUtc: string | null;
  locatario: string;
  salas: string[];
  nivelNome: string;
  nivelDescricao: string | null;
  qtdPessoas: number;
  valorCentavos: number;
  adicionais: AdicionalCoffee[];
  observacoes: string | null;
  /**
   * Itens ATUAIS do nível (não é snapshot — `coffee_breaks` não guarda
   * composição). O consolidado reflete os itens vigentes do nível.
   */
  composicao: ItemComposicao[];
}

/** Linha do consolidado de compras (unidade já convertida p/ exibição). */
export interface ItemConsolidado {
  item: string;
  unidade: string;
  quantidade: number;
}

export interface ConsolidadoCompras {
  itens: ItemConsolidado[];
  totalPessoas: number;
  qtdPedidos: number;
}

/** Formata uma quantidade de compra em pt-BR (inteiro sem casas; senão até 2). */
export function formatarQuantidade(qtd: number): string {
  return Number.isInteger(qtd)
    ? String(qtd)
    : qtd.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

/** "Mini sanduíche: 240 un" — uma linha do consolidado. */
export function formatarItemCompras(item: ItemConsolidado): string {
  return `${item.item}: ${formatarQuantidade(item.quantidade)} ${item.unidade}`;
}
