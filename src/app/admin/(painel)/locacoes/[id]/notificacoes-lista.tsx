"use client";

import { Mail, MessageCircle, RotateCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { dataSP, horaSP } from "@/lib/calendario/tempo";
import type { NotificacaoLinha } from "@/lib/locacoes/tipos";
import {
  CANAL_ROTULO,
  rotuloTemplate,
  STATUS_NOTIFICACAO_BADGE,
  STATUS_NOTIFICACAO_ROTULO,
} from "@/lib/notificacoes/rotulos";
import { reenviarNotificacaoAction } from "./notificacoes-actions";

/** Seção Notificações do detalhe da locação (Spec 15 §6). */
export function NotificacoesLista({
  notificacoes,
}: {
  notificacoes: NotificacaoLinha[];
}) {
  const router = useRouter();
  const [reenviando, setReenviando] = useState<string | null>(null);

  if (notificacoes.length === 0) {
    return (
      <p className="text-sm text-ink-muted">
        Nenhuma notificação enviada ainda.
      </p>
    );
  }

  async function reenviar(id: string) {
    setReenviando(id);
    const r = await reenviarNotificacaoAction(id);
    setReenviando(null);
    if (r.error) return toast.error(r.error);
    toast.success("Reenvio agendado.");
    router.refresh();
  }

  return (
    <ul className="flex flex-col gap-2">
      {notificacoes.map((n) => (
        <li key={n.id} className="flex flex-col gap-1 rounded-lg border p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {n.canal === "whatsapp" ? (
                <MessageCircle className="size-4 shrink-0 text-ink-muted" />
              ) : (
                <Mail className="size-4 shrink-0 text-ink-muted" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">
                  {rotuloTemplate(n.template)}
                </p>
                <p className="truncate text-xs text-ink-muted">
                  {CANAL_ROTULO[n.canal] ?? n.canal} · {n.destinatario}
                </p>
              </div>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_NOTIFICACAO_BADGE[n.status] ?? "bg-surface-muted text-ink-muted"}`}
            >
              {STATUS_NOTIFICACAO_ROTULO[n.status] ?? n.status}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-muted">
            {n.enviadaEmUtc ? (
              <span>
                Enviada em {dataSP(n.enviadaEmUtc)} {horaSP(n.enviadaEmUtc)}
              </span>
            ) : (
              <span>{n.tentativas} tentativa(s)</span>
            )}
            {n.ultimoErro && n.status !== "enviada" ? (
              <span className="text-destructive">{n.ultimoErro}</span>
            ) : null}
          </div>

          {n.status === "falha" ? (
            <div>
              <Button
                variant="outline"
                size="sm"
                loading={reenviando === n.id}
                onClick={() => reenviar(n.id)}
              >
                <RotateCw className="size-4" />
                Reenviar
              </Button>
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
