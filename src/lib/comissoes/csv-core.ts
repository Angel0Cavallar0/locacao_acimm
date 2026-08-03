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

/** Uma linha de comissão já resolvida para exportação (Ciclo 2 / §5). */
export interface LinhaCsvComissao {
  competencia: string; // 'YYYY-MM' (mês da quitação)
  locNumero: string; // 'LOC-000123'
  locatario: string;
  documento: string;
  salas: string; // nomes separados por ', '
  origem: string; // rótulo pt-BR
  recebidoEm: string; // 'dd/MM/yyyy' ou '' (previsão)
  formaPagamento: string; // rótulo pt-BR ou ''
  baseCentavos: number;
  valorCentavos: number;
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
  "valor_centavos",
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
    String(l.valorCentavos),
    l.pago,
  ]);
  return montarCsv(CABECALHO_COMISSOES, corpo);
}
