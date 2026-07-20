import "server-only";
import { dataSP, horaSP } from "@/lib/calendario/tempo";
import { parsearAdicionaisCoffee } from "@/lib/coffee/dados";
import {
  faixaDe,
  parsearFaixas,
  rotuloFaixa,
  valorPessoaDe,
} from "@/lib/coffee/faixas-core";
import { PERIODOS, type PeriodoDia } from "@/lib/dominio";
import type { FormaPagamento } from "@/lib/locacoes/tipos";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  type DadosContrato,
  parsearDadosPagamento,
  parsearTextos,
} from "./tipos";

const MESES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "15 de julho de 2026" a partir de um instante UTC (data em São Paulo). */
function porExtenso(isoUtc: string): string {
  const [dia, mes, ano] = dataSP(isoUtc).split("/").map(Number);
  return `${dia} de ${MESES[mes - 1]} de ${ano}`;
}

function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

/** Monta os dados do contrato (Spec 13 §2/§3). Service role. */
export async function carregarDadosContrato(
  locacaoId: string,
): Promise<DadosContrato | null> {
  const admin = createAdminClient();
  const { data: loc } = await admin
    .from("locacoes")
    .select("*")
    .eq("id", locacaoId)
    .maybeSingle();
  if (!loc) return null;

  const [salasRes, adicRes, coffeeRes, cfgRes] = await Promise.all([
    admin
      .from("locacao_salas")
      .select("salas ( nome, equipamentos )")
      .eq("locacao_id", locacaoId),
    admin
      .from("locacao_adicionais")
      .select("descricao, quantidade, valor_unitario_centavos")
      .eq("locacao_id", locacaoId)
      .order("criado_em", { ascending: true }),
    admin
      .from("coffee_breaks")
      .select("qtd_pessoas, valor_centavos, adicionais, coffee_niveis ( nome, faixas_preco )")
      .eq("locacao_id", locacaoId)
      .maybeSingle(),
    admin
      .from("configuracoes")
      .select("chave, valor")
      .in("chave", ["contrato_textos", "dados_pagamento"]),
  ]);

  const cfg = new Map(
    (cfgRes.data ?? []).map((r) => [r.chave as string, r.valor]),
  );
  const textos = parsearTextos(cfg.get("contrato_textos"));
  const dadosPagamento = parsearDadosPagamento(cfg.get("dados_pagamento"));

  const salas = (
    (salasRes.data ?? []) as Array<{
      salas:
        | { nome: string; equipamentos: string[] | null }
        | { nome: string; equipamentos: string[] | null }[]
        | null;
    }>
  ).map((ls) => {
    const s = um(ls.salas);
    return { nome: s?.nome ?? "Sala", equipamentos: s?.equipamentos ?? [] };
  });

  const coffeeRow = coffeeRes.data as {
    qtd_pessoas: number;
    valor_centavos: number;
    adicionais: unknown;
    coffee_niveis:
      | { nome: string; faixas_preco: unknown }
      | { nome: string; faixas_preco: unknown }[]
      | null;
  } | null;

  let coffee: DadosContrato["coffee"] = null;
  if (coffeeRow) {
    const nivel = um(coffeeRow.coffee_niveis);
    const faixas = parsearFaixas(nivel?.faixas_preco);
    const f = faixaDe(faixas, coffeeRow.qtd_pessoas);
    coffee = {
      nivelNome: nivel?.nome ?? "Coffee",
      qtdPessoas: coffeeRow.qtd_pessoas,
      faixaRotulo: f ? rotuloFaixa(f) : null,
      valorPessoaCentavos: valorPessoaDe(faixas, coffeeRow.qtd_pessoas),
      adicionais: parsearAdicionaisCoffee(coffeeRow.adicionais),
      valorCentavos: coffeeRow.valor_centavos,
    };
  }

  const responsavelRaw = (loc.responsavel_nome as string | null)?.trim() ?? "";
  const periodo = (loc.periodo as PeriodoDia | null) ?? null;

  return {
    numero: loc.numero,
    locatarioNome: loc.locatario_nome,
    locatarioDocumento: loc.locatario_documento,
    locatarioEmail: loc.locatario_email,
    locatarioTelefone: loc.locatario_telefone,
    responsavelNome: responsavelRaw || (loc.locatario_nome as string),
    responsavelFallback: responsavelRaw === "",
    associadoId: (loc.associado_id as string | null) ?? null,
    periodo,
    periodoRotulo: PERIODOS.find((p) => p.valor === periodo)?.rotulo ?? "—",
    horaInicio: horaSP(loc.inicio),
    horaFim: horaSP(loc.fim),
    dataEventoCurta: dataSP(loc.inicio),
    dataEventoExtenso: porExtenso(loc.inicio),
    qtdPessoas: loc.qtd_pessoas,
    tipoEvento: (loc.tipo_evento as string | null) ?? null,
    salas,
    coffee,
    adicionais: (
      (adicRes.data ?? []) as Array<{
        descricao: string;
        quantidade: number;
        valor_unitario_centavos: number;
      }>
    ).map((a) => ({
      descricao: a.descricao,
      quantidade: a.quantidade,
      valorUnitarioCentavos: a.valor_unitario_centavos,
    })),
    valorSalasCentavos: loc.valor_salas_centavos,
    valorCoffeeCentavos: loc.valor_coffee_centavos,
    valorAdicionaisCentavos: loc.valor_adicionais_centavos,
    valorDescontosCentavos: loc.valor_descontos_centavos,
    valorTotalCentavos: loc.valor_total_centavos,
    formaPagamento:
      (loc.forma_pagamento_preferida as FormaPagamento | null) ?? null,
    textos,
    dadosPagamento,
    dataGeracaoExtenso: porExtenso(new Date().toISOString()),
  };
}
