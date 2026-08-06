"use client";

import { Clock, Lock, Megaphone } from "lucide-react";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { horaSP, intervaloSP } from "@/lib/calendario/tempo";
import {
  type AgendaItem,
  PRIORIDADE_ROTULO,
  rotuloLocacao,
  STATUS_LOCACAO_ROTULO,
} from "@/lib/calendario/tipos";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { conteudoCurto, ehPendente } from "./helpers";

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-ink-muted">{rotulo}</span>
      <span className="text-right font-medium text-ink">{valor}</span>
    </div>
  );
}

function ResumoHover({ item }: { item: AgendaItem }) {
  return (
    <div className="flex flex-col gap-1 text-xs">
      <p className="mb-0.5 font-semibold text-ink">{item.salaNome}</p>
      <Linha rotulo="Horário" valor={intervaloSP(item.inicioUtc, item.fimUtc)} />
      {item.origem === "locacao" ? (
        <>
          <Linha rotulo="Locação" valor={rotuloLocacao(item.locacaoNumero)} />
          <Linha rotulo="Locatário" valor={item.locatario ?? "—"} />
          <Linha
            rotulo="Status"
            valor={
              item.status ? STATUS_LOCACAO_ROTULO[item.status] : "—"
            }
          />
          {item.qtdPessoas != null ? (
            <Linha rotulo="Pessoas" valor={String(item.qtdPessoas)} />
          ) : null}
          {item.coffeeHorarioServirUtc ? (
            <Linha
              rotulo="Coffee às"
              valor={horaSP(item.coffeeHorarioServirUtc)}
            />
          ) : null}
        </>
      ) : null}
      {item.origem === "evento_interno" ? (
        <>
          <Linha rotulo="Evento" valor={item.eventoTitulo ?? "ACIMM"} />
          <Linha
            rotulo="Prioridade"
            valor={item.prioridade ? PRIORIDADE_ROTULO[item.prioridade] : "—"}
          />
          {item.qtdInscritos != null ? (
            <Linha rotulo="Inscritos" valor={String(item.qtdInscritos)} />
          ) : null}
        </>
      ) : null}
      {item.origem === "bloqueio" ? (
        <>
          <Linha rotulo="Bloqueio" valor={item.motivo ?? "—"} />
          {item.responsavelNome ? (
            <Linha rotulo="Por" valor={item.responsavelNome} />
          ) : null}
        </>
      ) : null}
      {item.origem === "locacao" &&
      item.valorTotalCentavos != null &&
      item.valorTotalCentavos > 0 ? (
        <Linha
          rotulo="Total"
          valor={centavosParaBRL(item.valorTotalCentavos)}
        />
      ) : null}
    </div>
  );
}

/**
 * Conteúdo de um evento no grid do FullCalendar (§2). Título "{Sala} · {..}"
 * com ícone por origem e HoverCard (shadcn/PreviewCard) de resumo. O clique
 * continua borbulhando para o `eventClick` (abre o painel de detalhes); no
 * touch não há hover, então o toque abre direto o painel.
 */
export function EventoConteudo({ item }: { item: AgendaItem }) {
  const Icone =
    item.origem === "evento_interno"
      ? Megaphone
      : item.origem === "bloqueio"
        ? Lock
        : ehPendente(item)
          ? Clock
          : null;

  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <span className="flex w-full min-w-0 cursor-pointer items-center gap-1 px-1 py-0.5" />
        }
      >
        {Icone ? <Icone className="size-3 shrink-0" /> : null}
        <span className="truncate">
          {item.salaNome} · {conteudoCurto(item)}
        </span>
      </HoverCardTrigger>
      <HoverCardContent>
        <ResumoHover item={item} />
      </HoverCardContent>
    </HoverCard>
  );
}
