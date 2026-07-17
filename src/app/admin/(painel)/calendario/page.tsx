import type { Metadata } from "next";
import { requireColaborador } from "@/lib/auth/guards";
import { spWallParaUtc } from "@/lib/calendario/tempo";
import { createClient } from "@/lib/supabase/server";
import {
  CalendarioClient,
  type FiltrosIniciais,
} from "./calendario-client";
import { carregarAgenda } from "./dados";
import type { SalaFiltro } from "./filtros";
import { CATEGORIAS_STATUS, type CategoriaStatus } from "./helpers";

export const metadata: Metadata = { title: "Calendário" };

const STATUS_VALIDOS = new Set(CATEGORIAS_STATUS.map((c) => c.valor));

/** Janela inicial: mês corrente com folga (≤ 62 dias, limite da consulta §3). */
function janelaInicial(): { inicio: string; fim: string } {
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const [ano, mes] = hoje.split("-");
  const base = Date.parse(spWallParaUtc(`${ano}-${mes}-01`, "00:00"));
  return {
    inicio: new Date(base - 7 * 86_400_000).toISOString(),
    fim: new Date(base + 45 * 86_400_000).toISOString(),
  };
}

export default async function CalendarioPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireColaborador();
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: salasRows } = await supabase
    .from("salas")
    .select("id, nome, ativa")
    .is("excluida_em", null)
    .order("ordem", { ascending: true })
    .order("criado_em", { ascending: true });

  const salas: SalaFiltro[] = (salasRows ?? []).map((s) => ({
    id: s.id,
    nome: s.nome,
    ativa: s.ativa,
  }));

  const { inicio, fim } = janelaInicial();
  const { eventos, sobreposicoes } = await carregarAgenda(inicio, fim);

  const parseLista = (v: string | string[] | undefined) =>
    typeof v === "string" && v.length > 0 ? v.split(",") : null;

  const statusParam = parseLista(sp.status)?.filter((c): c is CategoriaStatus =>
    STATUS_VALIDOS.has(c as CategoriaStatus),
  );

  const filtrosIniciais: FiltrosIniciais = {
    salas: parseLista(sp.salas),
    status: statusParam && statusParam.length > 0 ? statusParam : null,
    responsavel: typeof sp.resp === "string" ? sp.resp : null,
  };

  return (
    <CalendarioClient
      salas={salas}
      eventosIniciais={eventos}
      sobreposicoesIniciais={sobreposicoes}
      filtrosIniciais={filtrosIniciais}
    />
  );
}
