import type { Metadata } from "next";
import { requireColaborador } from "@/lib/auth/guards";
import {
  contagensPendencia,
  listarPendencias,
  type VisaoPendencia,
} from "@/lib/pendencias/dados";
import { PendenciasClient } from "./pendencias-client";

export const metadata: Metadata = { title: "Pendências sem data" };

const VISOES: VisaoPendencia[] = ["aguardando", "encerradas"];

function texto(v: string | string[] | undefined): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export default async function PendenciasPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireColaborador();
  const sp = await searchParams;

  const visaoParam = texto(sp.visao);
  const visao: VisaoPendencia =
    visaoParam && VISOES.includes(visaoParam as VisaoPendencia)
      ? (visaoParam as VisaoPendencia)
      : "aguardando";

  const [contagens, entradas] = await Promise.all([
    contagensPendencia(),
    listarPendencias(visao),
  ]);

  return (
    <PendenciasClient entradas={entradas} contagens={contagens} visao={visao} />
  );
}
