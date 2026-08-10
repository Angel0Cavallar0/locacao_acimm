/**
 * Geração de CSV para o Excel pt-BR (Spec 21 §5). PURO/testável. Delimitador
 * `;` (padrão do Excel pt-BR, onde a vírgula é decimal) e prefixo BOM UTF-8 para
 * a acentuação abrir correta. Aspas em campos que contêm `;`, aspas ou quebra.
 */

const BOM = "﻿";
const SEP = ";";
const EOL = "\r\n";

/** Escapa um campo conforme RFC 4180 (aspas duplicadas), com delimitador `;`. */
export function escaparCampoCsv(valor: string): string {
  if (/[";\r\n]/.test(valor)) {
    return `"${valor.replace(/"/g, '""')}"`;
  }
  return valor;
}

/** Monta o CSV completo (com BOM) a partir do cabeçalho + linhas de strings. */
export function montarCsv(cabecalho: string[], linhas: string[][]): string {
  const todas = [cabecalho, ...linhas];
  const corpo = todas
    .map((l) => l.map(escaparCampoCsv).join(SEP))
    .join(EOL);
  return `${BOM}${corpo}${EOL}`;
}

/**
 * Uma linha de comissão já resolvida para exportação (Ciclo 3 / Spec 33 §9.2).
 * O `percentual` passou a ser obrigatório na exportação: com faixa por meta ele
 * varia de mês para mês, e sem ele o CSV não se explica.
 */
export interface LinhaCsvComissao {
  competencia: string; // 'YYYY-MM' (mês do recebimento)
  locNumero: string; // 'LOC-000123'
  locatario: string;
  documento: string;
  salas: string; // nomes separados por ', '
  origem: string; // rótulo pt-BR
  recebidoEm: string; // 'dd/MM/yyyy' ou '' (previsão)
  formaPagamento: string; // rótulo pt-BR ou ''
  baseCentavos: number;
  percentual: string; // '6' | '7,5'
  valorCentavos: number;
  bonusAplicado: string; // 'Sim' | 'Não' | ''
  competenciaStatus: string; // 'Fechada' | 'Em apuração' | 'Previsão'
  competenciaOriginal: string; // 'YYYY-MM' quando deslocada, senão ''
  pago: string; // 'Sim' | 'Não' | '' (previsão)
}

export const CABECALHO_COMISSOES = [
  "competencia",
  "loc_numero",
  "locatario",
  "documento",
  "salas",
  "origem",
  "recebido_em",
  "forma_pagamento",
  "base_centavos",
  "percentual",
  "valor_centavos",
  "bonus_aplicado",
  "competencia_status",
  "competencia_original",
  "pago",
];

export function montarCsvComissoes(linhas: LinhaCsvComissao[]): string {
  const corpo = linhas.map((l) => [
    l.competencia,
    l.locNumero,
    l.locatario,
    l.documento,
    l.salas,
    l.origem,
    l.recebidoEm,
    l.formaPagamento,
    String(l.baseCentavos),
    l.percentual,
    String(l.valorCentavos),
    l.bonusAplicado,
    l.competenciaStatus,
    l.competenciaOriginal,
    l.pago,
  ]);
  return montarCsv(CABECALHO_COMISSOES, corpo);
}
