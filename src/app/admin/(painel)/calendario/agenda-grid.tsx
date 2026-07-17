"use client";

import type {
  DatesSetArg,
  DateSelectArg,
  EventClickArg,
  EventInput,
} from "@fullcalendar/core";
import ptBrLocale from "@fullcalendar/core/locales/pt-br";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import FullCalendar from "@fullcalendar/react";
import { corDaSala } from "@/lib/calendario/cores";
import { utcParaNaiveSP } from "@/lib/calendario/tempo";
import type { AgendaItem } from "@/lib/calendario/tipos";
import { conteudoCurto, ehPendente } from "./helpers";
import { EventoConteudo } from "./evento-conteudo";

function mapear(itens: AgendaItem[], idsConflito: Set<string>): EventInput[] {
  return itens.map((item) => {
    const cor = corDaSala(item.salaId);
    const pendente = ehPendente(item);
    const bloqueio = item.origem === "bloqueio";
    const transparente = pendente || bloqueio;

    const classNames: string[] = [];
    if (pendente) classNames.push("ev-pendente");
    if (bloqueio) classNames.push("ev-bloqueio");
    if (idsConflito.has(item.id)) classNames.push("ev-conflito");
    if (item.origem === "evento_interno" && item.prioridade === "alta") {
      classNames.push("ev-alta");
    }

    return {
      id: item.id,
      title: `${item.salaNome} · ${conteudoCurto(item)}`,
      start: utcParaNaiveSP(item.inicioUtc),
      end: utcParaNaiveSP(item.fimUtc),
      backgroundColor: transparente ? "transparent" : cor.fundo,
      borderColor: cor.borda,
      textColor: transparente ? cor.borda : cor.texto,
      classNames,
      extendedProps: { item },
    };
  });
}

/**
 * Wrapper do FullCalendar (Spec 05 §2). SOMENTE plugins MIT (daygrid, list,
 * interaction) — nada premium. É carregado com ssr:false pelo orquestrador
 * para não renderizar no servidor. timeZone 'UTC' + datas "naive" de SP fazem
 * o horário exibido ser sempre o de São Paulo, independente do fuso do browser.
 */
export function AgendaGrid({
  itens,
  idsConflito,
  aoClicarEvento,
  aoMudarRange,
  aoSelecionarSlot,
}: {
  itens: AgendaItem[];
  idsConflito: Set<string>;
  aoClicarEvento: (item: AgendaItem) => void;
  aoMudarRange: (inicioUtc: string, fimUtc: string) => void;
  aoSelecionarSlot: (dataISO: string) => void;
}) {
  return (
    <div className="calendario-acimm">
      <FullCalendar
        plugins={[dayGridPlugin, listPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale={ptBrLocale}
        timeZone="UTC"
        headerToolbar={{
          left: "prev,next today",
          center: "title",
          right: "dayGridMonth,listMonth",
        }}
        buttonText={{ today: "Hoje", month: "Mês", list: "Lista" }}
        events={mapear(itens, idsConflito)}
        eventDisplay="block"
        eventContent={(arg) => (
          <EventoConteudo
            item={(arg.event.extendedProps as { item: AgendaItem }).item}
          />
        )}
        eventClick={(arg: EventClickArg) => {
          arg.jsEvent.preventDefault();
          aoClicarEvento(
            (arg.event.extendedProps as { item: AgendaItem }).item,
          );
        }}
        datesSet={(arg: DatesSetArg) =>
          aoMudarRange(arg.start.toISOString(), arg.end.toISOString())
        }
        selectable
        selectMirror={false}
        select={(arg: DateSelectArg) =>
          aoSelecionarSlot(arg.startStr.slice(0, 10))
        }
        editable={false}
        eventStartEditable={false}
        eventDurationEditable={false}
        dayMaxEvents={3}
        firstDay={0}
        displayEventTime
        eventTimeFormat={{ hour: "2-digit", minute: "2-digit", hour12: false }}
        height="auto"
      />
    </div>
  );
}
