import type { Metadata } from "next";
import type { TipoCombo } from "@/lib/dominio";
import { requireColaborador } from "@/lib/auth/guards";
import { parseDaterange } from "@/lib/precos/resolver-core";
import { urlFotoSala } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { type ComboCard, ComboLista } from "./combo-lista";
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

interface ComboRow {
  id: string;
  nome: string;
  tipo: TipoCombo;
  tipo_desconto: "percentual" | "valor" | null;
  desconto_valor: number | null;
  valor_centavos: number | null;
  ativo: boolean;
}

function resumoCombo(c: ComboRow, qtdSalas: number): string {
  if (c.tipo === "desconto_multi_sala") {
    const desc =
      c.tipo_desconto === "percentual"
        ? `${c.desconto_valor ?? 0}%`
        : centavosParaBRL(c.desconto_valor ?? 0);
    return `${desc} de desconto · ${qtdSalas} salas`;
  }
  if (c.tipo === "assinatura_mensal") {
    return `Mensal ${centavosParaBRL(c.valor_centavos ?? 0)}`;
  }
  return `Todas as salas · ${centavosParaBRL(c.valor_centavos ?? 0)}`;
}

export default async function SalasPage() {
  await requireColaborador();
  const supabase = await createClient();

  const [
    { data: salas },
    { data: precos },
    { data: combos },
    { data: comboSalas },
  ] = await Promise.all([
    supabase
      .from("salas")
      .select("id, nome, capacidade, ativa, ordem, fotos, criado_em")
      .order("ordem", { ascending: true })
      .order("criado_em", { ascending: true }),
    supabase.from("precos_sala").select("sala_id, vigencia"),
    supabase
      .from("combos")
      .select(
        "id, nome, tipo, tipo_desconto, desconto_valor, valor_centavos, ativo, criado_em",
      )
      .order("criado_em", { ascending: true }),
    supabase.from("combo_salas").select("combo_id"),
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
      vigentesPorSala.set(p.sala_id, (vigentesPorSala.get(p.sala_id) ?? 0) + 1);
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

  const qtdPorCombo = new Map<string, number>();
  for (const cs of comboSalas ?? []) {
    qtdPorCombo.set(cs.combo_id, (qtdPorCombo.get(cs.combo_id) ?? 0) + 1);
  }

  const comboCards: ComboCard[] = ((combos ?? []) as ComboRow[]).map((c) => ({
    id: c.id,
    nome: c.nome,
    tipo: c.tipo,
    ativo: c.ativo,
    resumo: resumoCombo(c, qtdPorCombo.get(c.id) ?? 0),
  }));

  return (
    <>
      <SalasLista salas={cards} />
      <ComboLista combos={comboCards} />
    </>
  );
}
