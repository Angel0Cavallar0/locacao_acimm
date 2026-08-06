import type { Metadata } from "next";
import { requireColaborador } from "@/lib/auth/guards";
import { contagensFila, listarFila } from "@/lib/lista-espera/dados";
import type { VisaoFila } from "@/lib/lista-espera/tipos";
import { createAdminClient } from "@/lib/supabase/admin";
import { ListaEsperaClient } from "./lista-espera-client";

export const metadata: Metadata = { title: "Pendentes" };

const VISOES: VisaoFila[] = ["aguardando", "vencidas", "encerradas"];

function texto(v: string | string[] | undefined): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export default async function ListaEsperaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireColaborador();
  const sp = await searchParams;

  const visaoParam = texto(sp.visao);
  const visao: VisaoFila =
    visaoParam && VISOES.includes(visaoParam as VisaoFila)
      ? (visaoParam as VisaoFila)
      : "aguardando";

  const salaId = texto(sp.sala);
  // O aviso de vaga liberada linka com ?sala=&data= → filtra aquele dia.
  const diaFoco = texto(sp.data);
  const de = diaFoco ?? texto(sp.de);
  const ate = diaFoco ?? texto(sp.ate);

  const admin = createAdminClient();
  const [{ data: salas }, contagens, entradas] = await Promise.all([
    admin
      .from("salas")
      .select("id, nome")
      .is("excluida_em", null)
      .order("ordem", { ascending: true }),
    contagensFila(),
    listarFila({ visao, salaId, de, ate }),
  ]);

  return (
    <ListaEsperaClient
      entradas={entradas}
      contagens={contagens}
      salas={(salas ?? []) as { id: string; nome: string }[]}
      filtro={{ visao, salaId, de, ate }}
    />
  );
}
