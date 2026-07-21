import { CalendarClock, ImageIcon, MessageCircle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { requireAssociado } from "@/lib/auth/guards";
import { dataSP, horaSP } from "@/lib/calendario/tempo";
import { parsearDadosPagamento } from "@/lib/contratos/tipos";
import {
  grupoStatus,
  STATUS_ROTULO,
} from "@/lib/locacoes/maquina-estados-core";
import { carregarLocacaoAssociado } from "@/lib/locacoes/portal-dados";
import type { ContatoAcimm } from "@/lib/disponibilidade/tipos";
import {
  FORMA_PAGAMENTO_ROTULO,
  rotuloLocacao,
} from "@/lib/locacoes/tipos";
import { createAdminClient } from "@/lib/supabase/admin";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { BaixarContrato } from "./baixar-contrato";
import { CancelarDialog } from "./cancelar-dialog";
import { ContratoAssinado } from "./contrato-assinado";
import { PagamentoComprovante } from "./pagamento-comprovante";
import { StepperStatus } from "./stepper-status";
import { TimelinePortal } from "./timeline-portal";

export const metadata: Metadata = { title: "Locação" };

const CONTRATO_ROTULO: Record<string, string> = {
  pendente: "Aguardando envio",
  enviado: "Aguardando assinatura",
  assinado: "Assinado",
  recusado: "Recusado",
  cancelado: "Cancelado",
};

export default async function LocacaoAssociadoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { associado } = await requireAssociado();
  const { id } = await params;

  const loc = await carregarLocacaoAssociado(id, {
    id: associado.id,
    userId: associado.user_id,
  });
  if (!loc) notFound();

  const grupo = grupoStatus(loc.status);
  const encerrada = grupo === "encerrada";
  const emAnalise = loc.status === "solicitada" || loc.status === "em_analise";

  const admin = createAdminClient();
  const { data: cfgRows } = await admin
    .from("configuracoes")
    .select("chave, valor")
    .in("chave", ["contato_acimm", "dados_pagamento"]);
  const cfgMap = new Map((cfgRows ?? []).map((r) => [r.chave as string, r.valor]));
  const cv = (cfgMap.get("contato_acimm") ?? {}) as Partial<ContatoAcimm>;
  const contatos = [cv.telefone, cv.whatsapp, cv.email].filter(Boolean);
  const contatoTexto = contatos.length > 0 ? contatos.join(" · ") : null;
  const dadosPagamento = parsearDadosPagamento(cfgMap.get("dados_pagamento"));

  const respostas = Object.entries(loc.respostasFormulario).filter(
    ([, v]) => typeof v === "string" && v.trim().length > 0,
  ) as [string, string][];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/locacoes" className="text-sm text-ink-muted hover:text-ink">
        ← Minhas locações
      </Link>

      {/* Cabeçalho + status */}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-display text-lg font-semibold text-ink">
                {rotuloLocacao(loc.numero)}
              </p>
              <p className="text-sm text-ink-muted">
                {dataSP(loc.inicioUtc)} · {horaSP(loc.inicioUtc)}–
                {horaSP(loc.fimUtc)}
              </p>
              {loc.combo ? (
                <span className="mt-1 inline-flex items-center rounded-full bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                  Combo · {loc.combo.nome}
                </span>
              ) : null}
            </div>
            <span className="rounded-full border border-brand/30 bg-brand/5 px-3 py-1 text-xs font-medium text-brand">
              {STATUS_ROTULO[loc.status]}
            </span>
          </div>

          {encerrada ? (
            <div className="rounded-md border border-input bg-surface-muted px-3 py-2 text-sm">
              <p className="font-medium text-ink">
                {loc.status === "recusada"
                  ? "Solicitação recusada"
                  : "Locação cancelada"}
              </p>
              {loc.motivoEncerramento ? (
                <p className="mt-0.5 text-ink-muted">
                  Motivo: {loc.motivoEncerramento}
                </p>
              ) : null}
            </div>
          ) : (
            <StepperStatus status={loc.status} />
          )}

          {emAnalise ? (
            <p className="text-xs text-ink-muted">
              Recebemos sua solicitação. Você será avisado por e-mail e WhatsApp
              a cada etapa.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {/* Evento */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink">Evento</h3>
          <div className="flex flex-col gap-2">
            {loc.salas.map((s) => (
              <div key={s.nome} className="flex items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-muted text-ink-muted">
                  {s.fotos[0] ? (
                    // biome-ignore lint/a11y/useAltText: alt fornecido
                    <img
                      src={s.fotos[0]}
                      alt={s.nome}
                      className="size-full object-cover"
                    />
                  ) : (
                    <ImageIcon className="size-4" />
                  )}
                </div>
                <span className="flex-1 text-sm text-ink">{s.nome}</span>
                <span className="text-sm text-ink-muted">
                  {centavosParaBRL(s.valorCentavos)}
                </span>
              </div>
            ))}
          </div>
          <dl className="grid gap-2 border-t pt-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-ink-muted">Data e horário</dt>
              <dd className="text-ink">
                {dataSP(loc.inicioUtc)} · {horaSP(loc.inicioUtc)}–
                {horaSP(loc.fimUtc)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink-muted">Nº de pessoas</dt>
              <dd className="text-ink">{loc.qtdPessoas}</dd>
            </div>
            {loc.tipoEvento ? (
              <div>
                <dt className="text-xs text-ink-muted">Tipo de evento</dt>
                <dd className="text-ink">{loc.tipoEvento}</dd>
              </div>
            ) : null}
            {loc.formaPagamento ? (
              <div>
                <dt className="text-xs text-ink-muted">Pagamento preferido</dt>
                <dd className="text-ink">
                  {FORMA_PAGAMENTO_ROTULO[loc.formaPagamento]}
                </dd>
              </div>
            ) : null}
          </dl>
          {loc.observacoes ? (
            <div className="border-t pt-3 text-sm">
              <p className="text-xs text-ink-muted">Observações</p>
              <p className="whitespace-pre-line text-ink">{loc.observacoes}</p>
            </div>
          ) : null}
          {respostas.length > 0 ? (
            <dl className="grid gap-2 border-t pt-3 text-sm sm:grid-cols-2">
              {respostas.map(([k, v]) => (
                <div key={k}>
                  <dt className="text-xs text-ink-muted">{k}</dt>
                  <dd className="text-ink">{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
        </CardContent>
      </Card>

      {/* Valores */}
      <Card>
        <CardContent className="flex flex-col gap-1 text-sm">
          <h3 className="mb-2 text-sm font-semibold text-ink">Valores</h3>
          <div className="flex justify-between">
            <span className="text-ink-muted">Salas</span>
            <span className="text-ink">
              {centavosParaBRL(loc.valorSalasCentavos)}
            </span>
          </div>
          {loc.valorCoffeeCentavos > 0 ? (
            <div className="flex justify-between">
              <span className="text-ink-muted">Coffee break</span>
              <span className="text-ink">
                {centavosParaBRL(loc.valorCoffeeCentavos)}
              </span>
            </div>
          ) : null}
          {loc.valorAdicionaisCentavos > 0 ? (
            <div className="flex justify-between">
              <span className="text-ink-muted">Adicionais</span>
              <span className="text-ink">
                {centavosParaBRL(loc.valorAdicionaisCentavos)}
              </span>
            </div>
          ) : null}
          {loc.valorDescontosCentavos > 0 ? (
            <div className="flex justify-between">
              <span className="text-ink-muted">Descontos</span>
              <span className="text-ink">
                −{centavosParaBRL(loc.valorDescontosCentavos)}
              </span>
            </div>
          ) : null}
          <div className="mt-1 flex justify-between border-t pt-1 font-semibold">
            <span className="text-ink">Total</span>
            <span className="text-ink">
              {centavosParaBRL(loc.valorTotalCentavos)}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Contrato (null-safe até o Spec 13) */}
      {loc.contrato ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-ink">Contrato</h3>
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Status</span>
              <span className="text-ink">
                {CONTRATO_ROTULO[loc.contrato.status] ?? loc.contrato.status}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {loc.contrato.linkAssinatura && !loc.contrato.assinadoEmUtc ? (
                <a
                  href={loc.contrato.linkAssinatura}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand/90"
                >
                  Assinar contrato
                </a>
              ) : null}
              {loc.contrato.temPdf ? (
                <BaixarContrato
                  locacaoId={loc.id}
                  rotulo={
                    loc.contrato.status === "assinado"
                      ? "Baixar contrato assinado"
                      : "Baixar o contrato"
                  }
                />
              ) : null}
            </div>
            {loc.contrato.status === "enviado" ? (
              <ContratoAssinado
                locacaoId={loc.id}
                assinadoEnviado={loc.contrato.assinadoEnviado}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Pagamento (null-safe até o Spec 14) */}
      {loc.pagamentos.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold text-ink">Pagamento</h3>
            {loc.pagamentos.map((p) => (
              <PagamentoComprovante
                key={p.id}
                pagamento={p}
                dadosPagamento={dadosPagamento}
                contato={contatoTexto}
              />
            ))}
            <p className="text-xs text-ink-muted">
              Envie o comprovante após o pagamento. A confirmação é feita pela
              ACIMM.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Coffee */}
      {loc.coffee ? (
        <Card>
          <CardContent className="flex flex-col gap-2 text-sm">
            <h3 className="text-sm font-semibold text-ink">Coffee break</h3>
            <div className="flex justify-between">
              <span className="text-ink-muted">Nível</span>
              <span className="text-ink">{loc.coffee.nivelNome}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-muted">Pessoas</span>
              <span className="text-ink">{loc.coffee.qtdPessoas}</span>
            </div>
            {loc.coffee.horarioServirUtc ? (
              <div className="flex justify-between">
                <span className="text-ink-muted">Servir às</span>
                <span className="text-ink">
                  {horaSP(loc.coffee.horarioServirUtc)}
                </span>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Cancelamento / contato */}
      {loc.podeCancelar ? (
        <Card>
          <CardContent className="flex flex-col gap-2">
            <CancelarDialog locacaoId={loc.id} />
            <p className="text-xs text-ink-muted">
              Você pode cancelar enquanto a solicitação ainda não foi aprovada.
            </p>
          </CardContent>
        </Card>
      ) : grupo === "andamento" ? (
        <div className="flex items-start gap-2 rounded-lg border border-brand/20 bg-brand/5 px-4 py-3 text-sm">
          <MessageCircle className="mt-0.5 size-4 shrink-0 text-brand" />
          <p className="text-ink-muted">
            Para cancelar ou alterar esta locação, fale com a ACIMM
            {contatoTexto ? `: ${contatoTexto}` : "."}
          </p>
        </div>
      ) : null}

      {/* Linha do tempo */}
      {loc.eventos.length > 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <CalendarClock className="size-4" />
              Andamento
            </h3>
            <TimelinePortal eventos={loc.eventos} />
          </CardContent>
        </Card>
      ) : null}

      {/* Ajuda */}
      <p className="px-1 text-xs text-ink-muted">
        Precisa alterar algo? Fale com a ACIMM
        {contatoTexto ? `: ${contatoTexto}` : "."}
      </p>
    </div>
  );
}
