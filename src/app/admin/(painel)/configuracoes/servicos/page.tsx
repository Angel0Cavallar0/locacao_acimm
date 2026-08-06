import type { Metadata } from "next";
import { requireColaborador } from "@/lib/auth/guards";
import { listarServicos } from "@/lib/servicos-adicionais/dados";
import { createAdminClient } from "@/lib/supabase/admin";
import { ServicosClient } from "./servicos-client";

export const metadata: Metadata = { title: "Serviços adicionais" };
export const dynamic = "force-dynamic";

export default async function ServicosPage() {
  await requireColaborador();
  const admin = createAdminClient();
  const [servicos, { data: salas }] = await Promise.all([
    listarServicos(),
    admin
      .from("salas")
      .select("id, nome")
      .is("excluida_em", null)
      .order("ordem", { ascending: true }),
  ]);

  return (
    <ServicosClient
      servicos={servicos}
      salas={(salas ?? []) as { id: string; nome: string }[]}
    />
  );
}
