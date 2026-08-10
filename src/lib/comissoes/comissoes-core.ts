/**
 * Núcleo PURO das comissões (Spec 21 §3, revisto pelos Specs 29 e 33). Sem I/O —
 * recebe a config já lida e as bases já apuradas. A geração (geracao.ts) e a tela
 * (dados.ts) consomem daqui.
 *
 * Ciclo 3 (Spec 33): a decisão de PERCENTUAL saiu deste arquivo e foi para
 * `apuracao-core.ts` — ele agora depende do total do MÊS, não da locação. Aqui
 * ficam as bases, o valor de uma linha e a aritmética de competência.
 * Testado com node:test; evita import de valor entre módulos locais.
 */

import type { ConfigComissoes } from "./apuracao-core";

export type { ConfigComissoes } from "./apuracao-core";

export type OrigemComissao = "locacao" | "coffee";

/** Bases (centavos) vindas da locação já confirmada — congeladas no snapshot. */
export interface BasesLocacao {
  valorSalasCentavos: number;
  valorDescontosCentavos: number;
  valorAdicionaisCentavos: number;
  valorCoffeeCentavos: number;
}

export interface BaseDevida {
  origem: OrigemComissao;
  baseCentavos: number;
}

/**
 * Valor da comissão de UMA linha: percentual da base, arredondado PARA BAIXO no
 * centavo. Espelho exato do `floor(base * pct / 100)` da RPC de apuração.
 *
 * O total do mês é a SOMA das linhas, nunca `floor(baseTotal * pct)`: o que se
 * paga é a linha (o CSV, o estorno e o "marcar paga" são por linha), e ratear o
 * resto faria o valor de uma linha depender do conjunto do mês — uma baixa no dia
 * 28 mudaria uma linha gerada no dia 3, inclusive já paga. A sobra é de no máximo
 * (n−1) centavos por grupo/mês.
 */
export function valorComissao(baseCentavos: number, percentual: number): number {
  if (baseCentavos <= 0 || percentual <= 0) return 0;
  return Math.floor((baseCentavos * percentual) / 100);
}

/**
 * Base da locação: salas + serviços adicionais, LÍQUIDO de descontos de sala.
 *
 * Ciclo 3 (Spec 33 §1): os adicionais VOLTARAM para a base — a ACIMM passou a
 * comissioná-los como locação de sala, revertendo a decisão do Spec 29 §4.1 que
 * os deixava a 0%. Todos os descontos do sistema são de sala (multi-sala/período
 * gratuito), então `valor_descontos_centavos` é a dedução correta. Nunca negativa.
 */
export function baseLocacao(bases: BasesLocacao): number {
  return Math.max(
    0,
    bases.valorSalasCentavos +
      bases.valorAdicionaisCentavos -
      bases.valorDescontosCentavos,
  );
}

/**
 * Aritmética de mês 'YYYY-MM' (puro): desloca `delta` meses. Ex.:
 * mesRelativo('2026-01', -1) = '2025-12'. Usado nas três visões da tela.
 */
export function mesRelativo(mes: string, delta: number): string {
  const [ano, m] = mes.split("-").map((n) => Number.parseInt(n, 10));
  const total = ano * 12 + (m - 1) + delta;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  return `${novoAno}-${String(novoMes).padStart(2, "0")}`;
}

/** Competência a partir do mês 'YYYY-MM' → '1º dia do mês' 'YYYY-MM-01'. */
export function competenciaDoMes(mes: string): string {
  return `${mes}-01`;
}

/** Mês 'YYYY-MM' de uma competência 'YYYY-MM-01'. */
export function mesDaCompetencia(competencia: string): string {
  return competencia.slice(0, 7);
}

/**
 * Primeira competência ABERTA a partir da desejada (Spec 33 §7.3).
 *
 * Uma competência fechada pode já ter sido paga ao colaborador; lançar dentro
 * dela reescreveria um total congelado. A resposta contábil é deslocar para o
 * próximo fechamento, guardando o mês real em `competencia_original`.
 * Teto de 12 meses evita laço infinito com config improvável.
 */
export function proximaCompetenciaAberta(
  desejada: string,
  fechadas: string[],
): string {
  const travadas = new Set(fechadas);
  let atual = desejada;
  for (let i = 0; i < 12; i++) {
    if (!travadas.has(atual)) return atual;
    atual = competenciaDoMes(mesRelativo(mesDaCompetencia(atual), 1));
  }
  return atual;
}

/**
 * Bases devidas por uma locação confirmada — SEM percentual/valor: no momento do
 * insert a competência ainda não foi apurada, e o percentual é do mês (Spec 33).
 * Só grupos ativos, com faixas configuradas e base > 0 geram linha.
 */
export function basesDevidas(
  cfg: ConfigComissoes,
  bases: BasesLocacao,
): BaseDevida[] {
  const linhas: BaseDevida[] = [];

  if (cfg.locacao.ativo && cfg.locacao.faixas.length > 0) {
    const base = baseLocacao(bases);
    if (base > 0) linhas.push({ origem: "locacao", baseCentavos: base });
  }

  if (cfg.coffee.ativo && cfg.coffee.faixas.length > 0) {
    const base = bases.valorCoffeeCentavos;
    if (base > 0) linhas.push({ origem: "coffee", baseCentavos: base });
  }

  return linhas;
}
