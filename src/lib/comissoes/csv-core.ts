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

/** Uma linha de comissão já resolvida para exportação (§5). */
export interface LinhaCsvComissao {
  competencia: string; // 'YYYY-MM'
  locNumero: string; // 'LOC-000123'
  locatario: string;
  documento: string;
  dataEvento: string; // 'dd/MM/yyyy'
  salas: string; // nomes separados por ', '
  origem: string; // rótulo pt-BR
  baseCentavos: number;
  valorCentavos: number;
}

export const CABECALHO_COMISSOES = [
  "competencia",
  "loc_numero",
  "locatario",
  "documento",
  "data_evento",
  "salas",
  "origem",
  "base_centavos",
  "valor_centavos",
];

export function montarCsvComissoes(linhas: LinhaCsvComissao[]): string {
  const corpo = linhas.map((l) => [
    l.competencia,
    l.locNumero,
    l.locatario,
    l.documento,
    l.dataEvento,
    l.salas,
    l.origem,
    String(l.baseCentavos),
    String(l.valorCentavos),
  ]);
  return montarCsv(CABECALHO_COMISSOES, corpo);
}
