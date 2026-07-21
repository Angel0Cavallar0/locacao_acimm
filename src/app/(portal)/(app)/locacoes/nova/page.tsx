import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { requireAssociado } from "@/lib/auth/guards";
import { listarSalasAtivas } from "@/lib/disponibilidade/dados";
import {
  dataMaximaSP,
  dentroDaJanela,
  hojeSP,
} from "@/lib/disponibilidade/janela";
import type { ContatoAcimm } from "@/lib/disponibilidade/tipos";
import { parsearAdicionaisCoffee } from "@/lib/coffee/dados";
import { parsearFaixas } from "@/lib/coffee/faixas-core";
import type { PeriodoDia } from "@/lib/dominio";
import { listarCombosAplicaveis } from "@/lib/locacoes/combos-dados";
import { createAdminClient } from "@/lib/supabase/admin";
import { SolicitacaoForm } from "./solicitacao-form";

export const metadata: Metadata = { title: "Nova solicitação" };

const PERIODOS_VALIDOS: PeriodoDia[] = [
  "manha",
  "tarde",
  "noite",
  "dia_inteiro",
];

function texto(v: string | string[] | undefined): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export default async function NovaSolicitacaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { associado } = await requireAssociado();
  const sp = await searchParams;
  const admin = createAdminClient();

  const [todasSalas, niveisRes, camposRes, cfgRes, combos] = await Promise.all([
    listarSalasAtivas(),
    admin
      .from("coffee_niveis")
      .select("id, nome, faixas_preco, adicionais")
      .eq("ativo", true)
      .order("ordem", { ascending: true }),
    admin
      .from("campos_formulario")
      .select("id, rotulo, tipo, opcoes, obrigatorio")
      .eq("ativo", true)
      .order("ordem", { ascending: true }),
    admin
      .from("configuracoes")
      .select("valor")
      .eq("chave", "contato_acimm")
      .maybeSingle(),
    listarCombosAplicaveis(),
  ]);

  const cv = (cfgRes.data?.valor ?? {}) as Partial<ContatoAcimm>;
  const contato: ContatoAcimm = {
    telefone: cv.telefone ?? "",
    whatsapp: cv.whatsapp ?? "",
    email: cv.email ?? "",
  };

  // Não-ativo não alcança o formulário (§3) — tela explicativa com contato.
  if (associado.situacao !== "ativo") {
    const contatos = [contato.telefone, contato.whatsapp, contato.email].filter(
      Boolean,
    );
    return (
      <div className="mx-auto max-w-lg">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <AlertTriangle className="size-8 text-amber-600" />
            <h2 className="font-display text-lg font-semibold text-ink">
              Novas solicitações indisponíveis
            </h2>
            <p className="text-sm text-ink-muted">
              Sua situação junto à ACIMM não permite abrir novas solicitações no
              momento. Seus dados e histórico seguem acessíveis.
            </p>
            {contatos.length > 0 ? (
              <p className="text-sm text-ink">
                Fale com a ACIMM: {contatos.join(" · ")}
              </p>
            ) : null}
            <Link
              href="/disponibilidade"
              className="text-sm font-medium text-brand hover:underline"
            >
              Voltar à disponibilidade
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const periodoPrefill = texto(sp.periodo);
  const dataBruta = texto(sp.data);
  const salaBruta = texto(sp.sala);

  return (
    <SolicitacaoForm
      todasSalas={todasSalas}
      niveis={(niveisRes.data ?? []).map((n) => ({
        id: n.id,
        nome: n.nome,
        faixas: parsearFaixas(n.faixas_preco),
        adicionais: parsearAdicionaisCoffee(n.adicionais),
      }))}
      campos={(camposRes.data ?? []).map((c) => ({
        id: c.id,
        rotulo: c.rotulo,
        tipo: c.tipo,
        opcoes: (c.opcoes as string[]) ?? [],
        obrigatorio: c.obrigatorio,
      }))}
      associado={{
        nome: associado.razao_social ?? associado.nome,
        documento: associado.documento ?? "",
        emails: associado.emails,
        telefone: associado.telefone ?? "",
      }}
      contato={contato}
      combos={combos}
      prefill={{
        salaId:
          salaBruta && todasSalas.some((s) => s.id === salaBruta)
            ? salaBruta
            : null,
        data:
          dataBruta &&
          /^\d{4}-\d{2}-\d{2}$/.test(dataBruta) &&
          dentroDaJanela(dataBruta)
            ? dataBruta
            : null,
        periodo:
          periodoPrefill &&
          PERIODOS_VALIDOS.includes(periodoPrefill as PeriodoDia)
            ? (periodoPrefill as PeriodoDia)
            : null,
      }}
      hoje={hojeSP()}
      dataMax={dataMaximaSP()}
    />
  );
}
