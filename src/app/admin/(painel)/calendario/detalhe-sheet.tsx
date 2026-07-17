"use client";

import { CalendarClock, ExternalLink, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { intervaloSP } from "@/lib/calendario/tempo";
import {
  type AgendaItem,
  PRIORIDADE_ROTULO,
  rotuloLocacao,
  STATUS_LOCACAO_ROTULO,
} from "@/lib/calendario/tipos";
import { centavosParaBRL } from "@/lib/utils/moeda";

function Campo({
  rotulo,
  children,
}: {
  rotulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-ink-muted">{rotulo}</span>
      <span className="text-sm text-ink">{children}</span>
    </div>
  );
}

function TituloOrigem(item: AgendaItem): string {
  if (item.origem === "locacao") return rotuloLocacao(item.locacaoNumero);
  if (item.origem === "evento_interno") return "Evento ACIMM";
  return "Bloqueio de sala";
}

export function DetalheSheet({
  item,
  aoFechar,
  aoRemoverBloqueio,
  removendo,
}: {
  item: AgendaItem | null;
  aoFechar: () => void;
  aoRemoverBloqueio: (agendaId: string) => void;
  removendo: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);

  // Zera a confirmação de remoção ao alternar entre itens sem fechar o painel.
  useEffect(() => {
    setConfirmando(false);
  }, [item?.id]);

  return (
    <Sheet
      open={item !== null}
      onOpenChange={(o) => {
        if (!o) {
          setConfirmando(false);
          aoFechar();
        }
      }}
    >
      <SheetContent>
        {item ? (
          <>
            <SheetHeader>
              <SheetTitle>{TituloOrigem(item)}</SheetTitle>
              <SheetDescription>{item.salaNome}</SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-3">
              <Campo rotulo="Horário">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-4 text-ink-muted" />
                  {intervaloSP(item.inicioUtc, item.fimUtc)}
                </span>
              </Campo>

              {item.origem === "locacao" ? (
                <>
                  <Campo rotulo="Status">
                    <Badge variant={item.bloqueante ? "default" : "outline"}>
                      {item.status ? STATUS_LOCACAO_ROTULO[item.status] : "—"}
                    </Badge>
                  </Campo>
                  <Campo rotulo="Locatário">{item.locatario ?? "—"}</Campo>
                  {item.qtdPessoas != null ? (
                    <Campo rotulo="Pessoas">
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="size-4 text-ink-muted" />
                        {item.qtdPessoas}
                      </span>
                    </Campo>
                  ) : null}
                  {item.valorTotalCentavos != null &&
                  item.valorTotalCentavos > 0 ? (
                    <Campo rotulo="Valor total">
                      {centavosParaBRL(item.valorTotalCentavos)}
                    </Campo>
                  ) : null}
                  {item.responsavelNome ? (
                    <Campo rotulo="Responsável">{item.responsavelNome}</Campo>
                  ) : null}
                </>
              ) : null}

              {item.origem === "evento_interno" ? (
                <>
                  <Campo rotulo="Título">{item.eventoTitulo ?? "—"}</Campo>
                  <Campo rotulo="Prioridade">
                    <Badge
                      variant={
                        item.prioridade === "alta" ? "destructive" : "secondary"
                      }
                    >
                      {item.prioridade
                        ? PRIORIDADE_ROTULO[item.prioridade]
                        : "—"}
                    </Badge>
                  </Campo>
                  {item.qtdInscritos != null ? (
                    <Campo rotulo="Inscritos">{item.qtdInscritos}</Campo>
                  ) : (
                    <p className="text-xs text-ink-muted">
                      Inscritos ainda não sincronizados.
                    </p>
                  )}
                </>
              ) : null}

              {item.origem === "bloqueio" ? (
                <>
                  <Campo rotulo="Motivo">{item.motivo ?? "—"}</Campo>
                  {item.responsavelNome ? (
                    <Campo rotulo="Criado por">{item.responsavelNome}</Campo>
                  ) : null}
                </>
              ) : null}
            </div>

            <SheetFooter>
              {item.origem === "locacao" && item.locacaoId ? (
                <Link
                  href={`/admin/locacoes/${item.locacaoId}`}
                  className={buttonVariants({ variant: "default" })}
                >
                  <ExternalLink className="size-4" />
                  Abrir locação
                </Link>
              ) : null}

              {item.origem === "evento_interno" ? (
                <Link
                  href="/admin/eventos"
                  className={buttonVariants({ variant: "default" })}
                >
                  <ExternalLink className="size-4" />
                  Abrir evento
                </Link>
              ) : null}

              {item.origem === "bloqueio" ? (
                confirmando ? (
                  <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                    <p className="text-sm text-ink">Remover este bloqueio?</p>
                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        size="sm"
                        loading={removendo}
                        onClick={() => aoRemoverBloqueio(item.id)}
                      >
                        Sim, remover
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={removendo}
                        onClick={() => setConfirmando(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    variant="outline"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setConfirmando(true)}
                  >
                    <Trash2 className="size-4" />
                    Remover bloqueio
                  </Button>
                )
              ) : null}
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
