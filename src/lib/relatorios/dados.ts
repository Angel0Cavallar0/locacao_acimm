import "server-only";
import { spWallParaUtc, utcParaNaiveSP } from "@/lib/calendario/tempo";
import { somarDias } from "@/lib/disponibilidade/janela";
import type { StatusLocacao } from "@/lib/locacoes/maquina-estados-core";
import { FORMA_PAGAMENTO_ROTULO, type FormaPagamento } from "@/lib/locacoes/tipos";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Relatório mensal de locações (Spec 32 §1.4) — mesma régua de receita do
 * dashboard (§1.1): só locações realmente arrecadadas no período
 * (confirmada/realizada/finalizada), com salas × coffee discriminados.
 */

const RECEITA: StatusLocacao[] = ["confirmada", "realizada", "finalizada"];

export interface LinhaRelatorioMes {
  numero: number;
  dataISO: string; // 'YYYY-MM-DD' (SP)
  salas: string;
  locatario: string;
  evento: string;
  forma: string;
  salasCentavos: number;
  coffeeCentavos: number;
  totalCentavos: number;
}

export interface RelatorioMes {
  deISO: string;
  ateISO: string;
  linhas: LinhaRelatorioMes[];
  subtotalSalasCentavos: number;
  subtotalCoffeeCentavos: number;
  totalCentavos: number;
  quantidade: number;
}

function nomesSalas(rel: unknown): string {
  if (!Array.isArray(rel)) return "—";
  const nomes: string[] = [];
  for (const ls of rel) {
    const s = (ls as { salas: unknown }).salas;
    const nome = Array.isArray(s)
      ? (s[0] as { nome?: string })?.nome
      : (s as { nome?: string })?.nome;
    if (nome) nomes.push(nome);
  }
  return nomes.length > 0 ? nomes.join(", ") : "—";
}

export async function carregarRelatorioMes(
  deISO: string,
  ateISO: string,
): Promise<RelatorioMes> {
  const admin = createAdminClient();
  const deUtc = spWallParaUtc(deISO, "00:00");
  const fimUtc = spWallParaUtc(somarDias(ateISO, 1), "00:00"); // `ate` inclusivo

  const { data } = await admin
    .from("locacoes")
    .select(
      "numero, inicio, locatario_nome, tipo_evento, forma_pagamento_preferida, valor_salas_centavos, valor_coffee_centavos, valor_total_centavos, status, locacao_salas ( salas ( nome ) )",
    )
    .gte("inicio", deUtc)
    .lt("inicio", fimUtc)
    .in("status", RECEITA)
    .order("inicio", { ascending: true });

  type Row = {
    numero: number;
    inicio: string;
    locatario_nome: string | null;
    tipo_evento: string | null;
    forma_pagamento_preferida: FormaPagamento | null;
    valor_salas_centavos: number | null;
    valor_coffee_centavos: number | null;
    valor_total_centavos: number | null;
    locacao_salas: unknown;
  };

  const linhas: LinhaRelatorioMes[] = [];
  let subSalas = 0;
  let subCoffee = 0;
  let total = 0;
  for (const r of (data ?? []) as Row[]) {
    const salasC = r.valor_salas_centavos ?? 0;
    const coffeeC = r.valor_coffee_centavos ?? 0;
    const totalC = r.valor_total_centavos ?? 0;
    subSalas += salasC;
    subCoffee += coffeeC;
    total += totalC;
    linhas.push({
      numero: r.numero,
      dataISO: utcParaNaiveSP(r.inicio).slice(0, 10),
      salas: nomesSalas(r.locacao_salas),
      locatario: r.locatario_nome ?? "—",
      evento: r.tipo_evento ?? "—",
      forma: r.forma_pagamento_preferida
        ? FORMA_PAGAMENTO_ROTULO[r.forma_pagamento_preferida]
        : "—",
      salasCentavos: salasC,
      coffeeCentavos: coffeeC,
      totalCentavos: totalC,
    });
  }

  return {
    deISO,
    ateISO,
    linhas,
    subtotalSalasCentavos: subSalas,
    subtotalCoffeeCentavos: subCoffee,
    totalCentavos: total,
    quantidade: linhas.length,
  };
}
