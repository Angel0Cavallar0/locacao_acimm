import { CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { requireAssociado } from "@/lib/auth/guards";
import { dataSP, horaSP } from "@/lib/calendario/tempo";
import { STATUS_ROTULO } from "@/lib/locacoes/maquina-estados-core";
import type { StatusLocacao } from "@/lib/locacoes/maquina-estados-core";
import {
  FORMA_PAGAMENTO_ROTULO,
  rotuloLocacao,
} from "@/lib/locacoes/tipos";
import type { FormaPagamento } from "@/lib/locacoes/tipos";
import { createClient } from "@/lib/supabase/server";
import { centavosParaBRL } from "@/lib/utils/moeda";

export const metadata: Metadata = { title: "Solicitação" };

/** Normaliza embed to-one (o client às vezes tipa como array). */
function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

// Solicitação recém-criada / em análise → tom de confirmação.
const EM_CONFIRMACAO: StatusLocacao[] = ["solicitada", "em_analise"];

export default async function LocacaoAssociadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAssociado();
  const { id } = await params;

  const supabase = await createClient();
  // RLS (`locacoes_select`) garante que o associado só lê as próprias locações.
  const { data: loc } = await supabase
    .from("locacoes")
    .select(
      `id, numero, status, inicio, fim, qtd_pessoas, tipo_evento, observacoes,
       valor_salas_centavos, valor_coffee_centavos, valor_total_centavos,
       forma_pagamento_preferida,
       locacao_salas ( valor_centavos, salas ( nome ) ),
       coffee_breaks ( valor_centavos, coffee_niveis ( nome ) )`,
    )
    .eq("id", id)
    .maybeSingle();

  if (!loc) notFound();

  const status = loc.status as StatusLocacao;
  const salas = ((loc.locacao_salas ?? []) as Array<{
    valor_centavos: number;
    salas: { nome: string } | { nome: string }[] | null;
  }>).map((ls) => ({
    nome: um(ls.salas)?.nome ?? "Sala",
    valorCentavos: ls.valor_centavos,
  }));
  const coffee = um(
    (loc.coffee_breaks ?? []) as Array<{
      valor_centavos: number;
      coffee_niveis: { nome: string } | { nome: string }[] | null;
    }>,
  );
  const emConfirmacao = EM_CONFIRMACAO.includes(status);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link
        href="/locacoes"
        className="text-sm text-ink-muted hover:text-ink"
      >
        ← Minhas locações
      </Link>

      {emConfirmacao ? (
        <div className="flex items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" />
          <div>
            <p className="font-medium text-ink">Solicitação recebida!</p>
            <p className="text-sm text-ink-muted">
              Sua solicitação será analisada pela ACIMM. Você receberá a
              confirmação e o contrato por e-mail e WhatsApp.
            </p>
          </div>
        </div>
      ) : null}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-lg font-semibold text-ink">
                {rotuloLocacao(loc.numero as number)}
              </p>
              <p className="text-sm text-ink-muted">
                {dataSP(loc.inicio as string)} ·{" "}
                {horaSP(loc.inicio as string)}–{horaSP(loc.fim as string)}
              </p>
            </div>
            <span className="rounded-full border border-brand/30 bg-brand/5 px-3 py-1 text-xs font-medium text-brand">
              {STATUS_ROTULO[status]}
            </span>
          </div>

          <div className="flex flex-col gap-1 border-t pt-3 text-sm">
            {salas.map((s) => (
              <div key={s.nome} className="flex justify-between">
                <span className="text-ink-muted">{s.nome}</span>
                <span className="text-ink">
                  {centavosParaBRL(s.valorCentavos)}
                </span>
              </div>
            ))}
            {coffee ? (
              <div className="flex justify-between">
                <span className="text-ink-muted">
                  Coffee break
                  {um(coffee.coffee_niveis)?.nome
                    ? ` · ${um(coffee.coffee_niveis)?.nome}`
                    : ""}
                </span>
                <span className="text-ink">
                  {centavosParaBRL(coffee.valor_centavos)}
                </span>
              </div>
            ) : null}
            <div className="flex justify-between border-t pt-1 font-semibold">
              <span className="text-ink">Total</span>
              <span className="text-ink">
                {centavosParaBRL(loc.valor_total_centavos as number)}
              </span>
            </div>
          </div>

          <dl className="grid gap-2 border-t pt-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-muted">Nº de pessoas</dt>
              <dd className="text-ink">{loc.qtd_pessoas as number}</dd>
            </div>
            {loc.tipo_evento ? (
              <div>
                <dt className="text-xs text-ink-muted">Tipo de evento</dt>
                <dd className="text-ink">{loc.tipo_evento as string}</dd>
              </div>
            ) : null}
            {loc.forma_pagamento_preferida ? (
              <div>
                <dt className="text-xs text-ink-muted">Pagamento preferido</dt>
                <dd className="text-ink">
                  {
                    FORMA_PAGAMENTO_ROTULO[
                      loc.forma_pagamento_preferida as FormaPagamento
                    ]
                  }
                </dd>
              </div>
            ) : null}
          </dl>

          {loc.observacoes ? (
            <div className="border-t pt-3 text-sm">
              <p className="text-xs text-ink-muted">Observações</p>
              <p className="whitespace-pre-line text-ink">
                {loc.observacoes as string}
              </p>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/locacoes"
          className="rounded-lg border px-3 py-2 text-sm text-ink hover:bg-surface-muted"
        >
          Minhas locações
        </Link>
        <Link
          href="/disponibilidade"
          className="rounded-lg border px-3 py-2 text-sm text-ink hover:bg-surface-muted"
        >
          Nova consulta
        </Link>
      </div>
    </div>
  );
}
