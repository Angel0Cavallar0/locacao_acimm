import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StatusLocacao } from "@/lib/locacoes/maquina-estados-core";
import { calcularItensCoffee } from "./calcular-itens-core";
import { parsearFaixas } from "./faixas-core";
import type { IntervaloCoffee } from "./periodo";
import type {
  AdicionalCoffee,
  ConsolidadoCompras,
  ItemComposicao,
  NivelCoffee,
  PedidoCoffee,
} from "./tipos";

/**
 * Camada de leitura do coffee break (Spec 08). Usa o admin client (a escrita
 * é sempre via service role; a leitura acompanha o mesmo caminho do detalhe da
 * locação para não depender de RLS de associado).
 */

/** Cadeia "firme": entra no consolidado e no PDF de compras. */
const STATUS_FIRMES: StatusLocacao[] = [
  "aprovada",
  "contrato_enviado",
  "contrato_assinado",
  "aguardando_pagamento",
  "confirmada",
  "realizada",
  "finalizada",
];
/** Pendentes: opcionais na tabela, nunca no consolidado/PDF. */
const STATUS_PENDENTES: StatusLocacao[] = ["solicitada", "em_analise"];

const FIRMES = new Set<StatusLocacao>(STATUS_FIRMES);

/** Item com quantidade fixa por pedido. Aceita `qtd` ou o legado `qtd_por_pessoa`. */
export function parsearComposicao(raw: unknown): ItemComposicao[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        item: String(o.item ?? "").trim(),
        qtd: Number(o.qtd ?? o.qtd_por_pessoa ?? o.qtdPorPessoa ?? 0) || 0,
        unidade: String(o.unidade ?? "").trim(),
      };
    })
    .filter((c) => c.item !== "");
}

/** Aceita `valorCentavos` (padrão gravado pelo formulário) ou `valor_centavos`. */
export function parsearAdicionaisCoffee(raw: unknown): AdicionalCoffee[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r) => {
      const o = (r ?? {}) as Record<string, unknown>;
      return {
        descricao: String(o.descricao ?? "").trim(),
        valorCentavos: Number(o.valorCentavos ?? o.valor_centavos ?? 0) || 0,
      };
    })
    .filter((a) => a.descricao !== "");
}

/** Todos os níveis (config). `apenasAtivos` filtra para os seletores. */
export async function listarNiveis(
  apenasAtivos = false,
): Promise<NivelCoffee[]> {
  const admin = createAdminClient();
  let q = admin
    .from("coffee_niveis")
    .select("id, nome, descricao, faixas_preco, composicao, ativo, ordem")
    .order("ordem", { ascending: true })
    .order("criado_em", { ascending: true });
  if (apenasAtivos) q = q.eq("ativo", true);

  const { data } = await q;
  return (data ?? []).map((n) => ({
    id: n.id as string,
    nome: n.nome as string,
    descricao: (n.descricao as string) ?? null,
    faixas: parsearFaixas(n.faixas_preco),
    composicao: parsearComposicao(n.composicao),
    ativo: n.ativo as boolean,
    ordem: n.ordem as number,
  }));
}

interface SalaNome {
  nome?: string;
}
interface LocacaoJoin {
  id: string;
  numero: number;
  status: StatusLocacao;
  inicio: string;
  fim: string;
  locatario_nome: string;
  locacao_salas: { salas: SalaNome | SalaNome[] | null }[] | null;
}

function nomesDasSalas(loc: LocacaoJoin): string[] {
  return (loc.locacao_salas ?? [])
    .map((ls) => {
      const s = ls.salas;
      return Array.isArray(s) ? (s[0]?.nome ?? "") : (s?.nome ?? "");
    })
    .filter(Boolean);
}

export interface ResultadoPedidos {
  pedidos: PedidoCoffee[];
  consolidado: ConsolidadoCompras;
}

/**
 * Pedidos de coffee cujo EVENTO (locacoes.inicio) cai no intervalo. O
 * consolidado agrega apenas os pedidos firmes, independentemente de os
 * pendentes estarem ou não sendo exibidos na tabela.
 */
export async function carregarPedidosCoffee(
  intervalo: IntervaloCoffee,
  incluirPendentes: boolean,
): Promise<ResultadoPedidos> {
  const admin = createAdminClient();
  const statusFiltro = incluirPendentes
    ? [...STATUS_FIRMES, ...STATUS_PENDENTES]
    : STATUS_FIRMES;

  const { data } = await admin
    .from("coffee_breaks")
    .select(
      `id, qtd_pessoas, valor_centavos, horario_servir, adicionais, observacoes,
       coffee_niveis ( nome, descricao, composicao ),
       locacoes!inner ( id, numero, status, inicio, fim, locatario_nome,
         locacao_salas ( salas ( nome ) ) )`,
    )
    .gte("locacoes.inicio", intervalo.inicioUtc)
    .lt("locacoes.inicio", intervalo.fimUtc)
    .in("locacoes.status", statusFiltro);

  type Row = {
    id: string;
    qtd_pessoas: number;
    valor_centavos: number;
    horario_servir: string | null;
    adicionais: unknown;
    observacoes: string | null;
    coffee_niveis:
      | { nome?: string; descricao?: string | null; composicao?: unknown }
      | Array<{ nome?: string; descricao?: string | null; composicao?: unknown }>
      | null;
    locacoes: LocacaoJoin | LocacaoJoin[] | null;
  };

  const pedidos: PedidoCoffee[] = ((data ?? []) as unknown as Row[])
    .map((r) => {
      const loc = Array.isArray(r.locacoes) ? r.locacoes[0] : r.locacoes;
      if (!loc) return null;
      const nivel = Array.isArray(r.coffee_niveis)
        ? r.coffee_niveis[0]
        : r.coffee_niveis;
      const status = loc.status;
      return {
        coffeeId: r.id,
        locacaoId: loc.id,
        numero: loc.numero,
        status,
        firme: FIRMES.has(status),
        inicioUtc: loc.inicio,
        fimUtc: loc.fim,
        horarioServirUtc: r.horario_servir,
        locatario: loc.locatario_nome,
        salas: nomesDasSalas(loc),
        nivelNome: nivel?.nome ?? "",
        nivelDescricao: nivel?.descricao ?? null,
        qtdPessoas: r.qtd_pessoas,
        valorCentavos: r.valor_centavos,
        adicionais: parsearAdicionaisCoffee(r.adicionais),
        observacoes: r.observacoes,
        composicao: parsearComposicao(nivel?.composicao),
      } satisfies PedidoCoffee;
    })
    .filter((p): p is PedidoCoffee => p !== null)
    .sort((a, b) =>
      a.inicioUtc === b.inicioUtc
        ? a.numero - b.numero
        : a.inicioUtc < b.inicioUtc
          ? -1
          : 1,
    );

  const consolidado = calcularItensCoffee(
    pedidos
      .filter((p) => p.firme)
      .map((p) => ({ qtdPessoas: p.qtdPessoas, composicao: p.composicao })),
  );

  return { pedidos, consolidado };
}
