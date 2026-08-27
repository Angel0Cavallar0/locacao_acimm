import type { Metadata } from "next";
import { requireColaborador } from "@/lib/auth/guards";
import { listarCotacoes } from "@/lib/cotacoes/dados";
import type { StatusCotacao } from "@/lib/cotacoes/tipos";
import { createClient } from "@/lib/supabase/server";
import { CotacoesClient } from "./cotacoes-client";

export const metadata: Metadata = { title: "Cotações" };

const STATUS: (StatusCotacao | "todas")[] = [
  "pendente",
  "convertida",
  "arquivada",
  "todas",
];

function texto(v: string | string[] | undefined): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export default async function CotacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireColaborador();
  const sp = await searchParams;
  const statusParam = texto(sp.status);
  const status: StatusCotacao | "todas" =
    statusParam && STATUS.includes(statusParam as StatusCotacao | "todas")
      ? (statusParam as StatusCotacao | "todas")
      : "pendente";

  const supabase = await createClient();
  const [cotacoes, { data: salas }, { data: niveis }] = await Promise.all([
    listarCotacoes(status),
    supabase
      .from("salas")
      .select("id, nome")
      .eq("ativa", true)
      .is("excluida_em", null)
      .order("ordem", { ascending: true }),
    supabase
      .from("coffee_niveis")
      .select("id, nome")
      .eq("ativo", true)
      .order("ordem", { ascending: true }),
  ]);

  return (
    <CotacoesClient
      cotacoes={cotacoes}
      status={status}
      salas={salas ?? []}
      niveis={niveis ?? []}
    />
  );
}
