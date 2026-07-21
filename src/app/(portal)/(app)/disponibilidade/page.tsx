import type { Metadata } from "next";
import { requireAssociado } from "@/lib/auth/guards";
import { listarDisponibilidade, listarSalasAtivas } from "@/lib/disponibilidade/dados";
import {
  dataMaximaSP,
  dentroDaJanela,
  hojeSP,
  somarDias,
} from "@/lib/disponibilidade/janela";
import { listarCombosAplicaveis } from "@/lib/locacoes/combos-dados";
import { DisponibilidadeClient } from "./disponibilidade-client";

export const metadata: Metadata = { title: "Disponibilidade" };

function texto(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

export default async function DisponibilidadePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { associado } = await requireAssociado();
  const sp = await searchParams;

  // A disponibilidade começa em AMANHÃ (não permitimos reserva no mesmo dia §B).
  const amanha = somarDias(hojeSP(), 1);
  const bruta = texto(sp.data);
  const data =
    /^\d{4}-\d{2}-\d{2}$/.test(bruta) && dentroDaJanela(bruta) && bruta >= amanha
      ? bruta
      : amanha;
  const salaIds = texto(sp.salas)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const cap = Number(texto(sp.cap)) || 0;

  const [todasSalas, inicial, combos] = await Promise.all([
    listarSalasAtivas(),
    listarDisponibilidade({
      data,
      salaIds: salaIds.length > 0 ? salaIds : null,
      capacidadeMin: cap || null,
      situacao: associado.situacao,
      associadoId: associado.id,
    }),
    // Combos aparecem direto na tela só para associado ativo (§B).
    associado.situacao === "ativo" ? listarCombosAplicaveis() : [],
  ]);

  return (
    <DisponibilidadeClient
      inicial={inicial}
      todasSalas={todasSalas}
      combos={combos}
      dataMin={amanha}
      dataMax={dataMaximaSP()}
      filtroInicial={{ salaIds, cap }}
      prefill={{
        nome: associado.razao_social ?? associado.nome,
        contato: associado.telefone ?? "",
      }}
    />
  );
}
