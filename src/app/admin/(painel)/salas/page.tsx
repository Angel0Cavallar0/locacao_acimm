import type { Metadata } from "next";
import { requireColaborador } from "@/lib/auth/guards";
import { parseDaterange } from "@/lib/precos/resolver-core";
import { urlFotoSala } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { SalasLista } from "./salas-lista";

export const metadata: Metadata = { title: "Salas" };

export interface SalaCard {
  id: string;
  nome: string;
  capacidade: number;
  ativa: boolean;
  capaUrl: string | null;
  totalFotos: number;
  precosVigentes: number;
}

export default async function SalasPage() {
  await requireColaborador();
  const supabase = await createClient();

  const [{ data: salas }, { data: precos }] = await Promise.all([
    supabase
      .from("salas")
      .select("id, nome, capacidade, ativa, ordem, fotos, criado_em")
      .order("ordem", { ascending: true })
      .order("criado_em", { ascending: true }),
    supabase.from("precos_sala").select("sala_id, vigencia"),
  ]);

  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  const vigentesPorSala = new Map<string, number>();
  for (const p of precos ?? []) {
    const { inicio, fim } = parseDaterange(String(p.vigencia));
    const vigente =
      (inicio === null || hoje >= inicio) && (fim === null || hoje < fim);
    if (vigente) {
      vigentesPorSala.set(
        p.sala_id,
        (vigentesPorSala.get(p.sala_id) ?? 0) + 1,
      );
    }
  }

  const cards: SalaCard[] = (salas ?? []).map((s) => {
    const fotos = (s.fotos as string[] | null) ?? [];
    return {
      id: s.id,
      nome: s.nome,
      capacidade: s.capacidade,
      ativa: s.ativa,
      capaUrl: fotos[0] ? urlFotoSala(fotos[0]) : null,
      totalFotos: fotos.length,
      precosVigentes: vigentesPorSala.get(s.id) ?? 0,
    };
  });

  return <SalasLista salas={cards} />;
}
