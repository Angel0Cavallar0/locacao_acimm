import { CalendarDays } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { requireColaborador } from "@/lib/auth/guards";
import { dataSP, horaSP, intervaloSP, utcParaNaiveSP } from "@/lib/calendario/tempo";
import { listarNiveis } from "@/lib/coffee/dados";
import { PERIODOS } from "@/lib/dominio";
import { carregarLocacao } from "@/lib/locacoes/dados";
import { podeEditarAdicionais } from "@/lib/locacoes/maquina-estados-core";
import {
  FORMA_PAGAMENTO_ROTULO,
  formatarDocumento,
  rotuloLocacao,
} from "@/lib/locacoes/tipos";
import { createClient } from "@/lib/supabase/server";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { AcoesLocacao } from "../acoes-locacao";
import { AdicionaisEditor } from "../adicionais-editor";
import { CoffeeEditor } from "../coffee-editor";
import { LinhaDoTempo } from "../linha-do-tempo";
import { StatusBadge } from "../status-badge";
import { ContratoAcoes } from "./contrato-acoes";
import { NotificacoesLista } from "./notificacoes-lista";
import { PagamentosGestao } from "./pagamentos-gestao";

const STATUS_COM_CONTRATO = new Set([
  "aprovada",
  "contrato_enviado",
  "contrato_assinado",
  "aguardando_pagamento",
  "confirmada",
  "realizada",
]);

export const metadata: Metadata = { title: "Locação" };

function Secao({
  titulo,
  children,
  acao,
}: {
  titulo: string;
  children: React.ReactNode;
  acao?: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">{titulo}</h3>
          {acao}
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-ink-muted">{rotulo}</span>
      <span className="text-right text-ink">{valor}</span>
    </div>
  );
}

export default async function LocacaoDetalhePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireColaborador();
  const { id } = await params;

  const loc = await carregarLocacao(id);
  if (!loc) notFound();

  const supabase = await createClient();
  const [{ data: salasRows }, niveis] = await Promise.all([
    supabase
      .from("salas")
      .select("id, nome")
      .is("excluida_em", null)
      .order("ordem", { ascending: true }),
    listarNiveis(true),
  ]);
  const niveisOpcoes = niveis.map((n) => ({
    id: n.id,
    nome: n.nome,
    faixas: n.faixas,
    adicionais: n.adicionais,
  }));

  const periodoRotulo = loc.periodo
    ? (PERIODOS.find((p) => p.valor === loc.periodo)?.rotulo ?? loc.periodo)
    : null;
  const editavelAdicionais = podeEditarAdicionais(loc.status);
  const respostas = Object.entries(loc.respostasFormulario);

  const dataFoco = utcParaNaiveSP(loc.inicioUtc).slice(0, 10);
  const salaFoco = loc.salas[0]?.salaId ?? "";
  const linkCalendario = `/admin/calendario?data=${dataFoco}${
    salaFoco ? `&sala=${salaFoco}` : ""
  }`;

  return (
    <div className="mx-auto max-w-5xl">
      <Link
        href="/admin/locacoes"
        className="mb-3 inline-block text-sm text-ink-muted hover:text-ink"
      >
        ← Locações
      </Link>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        {/* Coluna principal */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-lg font-semibold text-ink">
                    {rotuloLocacao(loc.numero)}
                  </h2>
                  <StatusBadge status={loc.status} />
                </div>
                <p className="text-xs text-ink-muted">
                  {loc.criadoPorNome ? `${loc.criadoPorNome} · ` : ""}
                  {dataSP(loc.criadoEmUtc)}
                </p>
              </div>

              {loc.motivoEncerramento ? (
                <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                  Motivo: {loc.motivoEncerramento}
                </p>
              ) : null}

              <AcoesLocacao
                locacao={{
                  id: loc.id,
                  status: loc.status,
                  inicioUtc: loc.inicioUtc,
                  fimUtc: loc.fimUtc,
                  periodo: loc.periodo,
                  valorTotalCentavos: loc.valorTotalCentavos,
                  salas: loc.salas.map((s) => ({
                    salaId: s.salaId,
                    nome: s.nome,
                  })),
                }}
                salasDisponiveis={salasRows ?? []}
              />
            </CardContent>
          </Card>

          <Secao titulo="Dados do evento">
            <div className="flex flex-col gap-1.5">
              {loc.salas.map((s) => (
                <Linha
                  key={s.salaId}
                  rotulo={s.nome}
                  valor={centavosParaBRL(s.valorCentavos)}
                />
              ))}
            </div>
            <div className="mt-1 flex flex-col gap-1.5 border-t pt-2">
              <Linha
                rotulo="Data e horário"
                valor={intervaloSP(loc.inicioUtc, loc.fimUtc)}
              />
              {periodoRotulo ? (
                <Linha rotulo="Período" valor={periodoRotulo} />
              ) : null}
              <Linha rotulo="Pessoas" valor={String(loc.qtdPessoas)} />
              {loc.tipoEvento ? (
                <Linha rotulo="Tipo" valor={loc.tipoEvento} />
              ) : null}
              {loc.formaPagamento ? (
                <Linha
                  rotulo="Pagamento preferido"
                  valor={FORMA_PAGAMENTO_ROTULO[loc.formaPagamento]}
                />
              ) : null}
            </div>
            {loc.observacoes ? (
              <p className="rounded-md bg-surface-muted px-3 py-2 text-sm text-ink-muted">
                {loc.observacoes}
              </p>
            ) : null}
            {respostas.length > 0 ? (
              <div className="border-t pt-2">
                <p className="mb-1 text-xs font-medium text-ink-muted">
                  Formulário
                </p>
                <div className="flex flex-col gap-1">
                  {respostas.map(([k, v]) => (
                    <Linha key={k} rotulo={k} valor={String(v)} />
                  ))}
                </div>
              </div>
            ) : null}
          </Secao>

          <Secao titulo="Locatário">
            <div className="flex flex-col gap-1.5">
              <Linha rotulo="Nome" valor={loc.locatarioNome} />
              <Linha
                rotulo="Documento"
                valor={formatarDocumento(loc.locatarioDocumento)}
              />
              <Linha rotulo="E-mail" valor={loc.locatarioEmail} />
              <Linha rotulo="Telefone" valor={loc.locatarioTelefone} />
              {loc.responsavelNome ? (
                <Linha rotulo="Responsável" valor={loc.responsavelNome} />
              ) : null}
              {loc.associadoNome ? (
                <Linha
                  rotulo="Associado"
                  valor={
                    <span className="inline-flex items-center gap-1.5">
                      {loc.associadoNome}
                    </span>
                  }
                />
              ) : (
                <Linha rotulo="Vínculo" valor="Locatário externo" />
              )}
            </div>
          </Secao>

          <Secao titulo="Valores">
            <div className="flex flex-col gap-1.5">
              <Linha
                rotulo="Locação"
                valor={centavosParaBRL(loc.valorSalasCentavos)}
              />
              <Linha
                rotulo="Coffee break"
                valor={centavosParaBRL(loc.valorCoffeeCentavos)}
              />
              <Linha
                rotulo="Adicionais"
                valor={centavosParaBRL(loc.valorAdicionaisCentavos)}
              />
              {loc.valorDescontosCentavos > 0 ? (
                <Linha
                  rotulo="Descontos"
                  valor={`- ${centavosParaBRL(loc.valorDescontosCentavos)}`}
                />
              ) : null}
              <div className="flex justify-between gap-4 border-t pt-2 text-sm font-semibold">
                <span className="text-ink">Total</span>
                <span className="text-ink">
                  {centavosParaBRL(loc.valorTotalCentavos)}
                </span>
              </div>
              {loc.periodoGratuitoAplicado ? (
                <p className="text-xs text-brand">
                  Período gratuito do sócio aplicado.
                </p>
              ) : null}
            </div>
          </Secao>

          <Secao titulo="Adicionais">
            <AdicionaisEditor
              locacaoId={loc.id}
              adicionais={loc.adicionais}
              editavel={editavelAdicionais}
            />
          </Secao>

          <Secao titulo="Coffee break">
            <CoffeeEditor
              locacaoId={loc.id}
              coffee={loc.coffee}
              niveis={niveisOpcoes}
              editavel={editavelAdicionais}
            />
          </Secao>

          <Secao titulo="Contrato">
            {loc.contrato ? (
              <div className="flex flex-col gap-2">
                <Linha rotulo="Status" valor={loc.contrato.status} />
                {loc.contrato.linkAssinatura ? (
                  <a
                    href={loc.contrato.linkAssinatura}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-brand hover:underline"
                  >
                    Link de assinatura
                  </a>
                ) : null}
                <ContratoAcoes
                  locacaoId={loc.id}
                  temContrato
                  temPdf={Boolean(loc.contrato.pdfUrl)}
                  temAssinado={loc.contrato.temAssinado}
                  assinado={loc.contrato.status === "assinado"}
                />
              </div>
            ) : STATUS_COM_CONTRATO.has(loc.status) ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-ink-muted">
                  Contrato ainda não gerado.
                </p>
                <ContratoAcoes
                  locacaoId={loc.id}
                  temContrato={false}
                  temPdf={false}
                  temAssinado={false}
                  assinado={false}
                />
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                O contrato é gerado ao aprovar a locação.
              </p>
            )}
          </Secao>

          <Secao titulo="Pagamentos">
            <PagamentosGestao
              locacaoId={loc.id}
              status={loc.status}
              valorTotalCentavos={loc.valorTotalCentavos}
              pagamentos={loc.pagamentos}
            />
          </Secao>

          <Secao titulo="Notificações">
            <NotificacoesLista notificacoes={loc.notificacoes} />
          </Secao>
        </div>

        {/* Coluna lateral */}
        <div className="flex flex-col gap-4">
          <Card>
            <CardContent className="flex flex-col gap-3">
              <Link
                href={linkCalendario}
                className="inline-flex items-center gap-2 text-sm text-brand hover:underline"
              >
                <CalendarDays className="size-4" />
                Ver no calendário
              </Link>
            </CardContent>
          </Card>

          <Secao titulo="Linha do tempo">
            <LinhaDoTempo eventos={loc.eventos} />
          </Secao>
        </div>
      </div>
    </div>
  );
}
