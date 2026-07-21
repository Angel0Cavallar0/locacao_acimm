"use client";

import {
  AlertTriangle,
  Calendar as CalendarIcon,
  CheckCircle2,
  Link2,
  Link2Off,
  RefreshCw,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dataSP, horaSP } from "@/lib/calendario/tempo";
import {
  conectarGoogleAction,
  desconectarGoogleAction,
  escolherCalendarioAction,
} from "./actions";

interface ConexaoView {
  contaEmail: string;
  calendarioId: string;
  status: "ativa" | "expirada";
  conectadoPor: string | null;
  atualizadoEm: string;
}
interface CalendarioView {
  id: string;
  summary: string;
  primary: boolean;
}

const MENSAGENS: Record<string, { ok: boolean; texto: string }> = {
  ok: { ok: true, texto: "Conta do Google Agenda conectada com sucesso." },
  erro: {
    ok: false,
    texto: "Não foi possível concluir a conexão. Tente novamente.",
  },
  negado: { ok: false, texto: "Autorização cancelada." },
  state: {
    ok: false,
    texto: "Sessão de autorização inválida ou expirada. Refaça a conexão.",
  },
  indisponivel: {
    ok: false,
    texto: "Integração indisponível — credenciais não configuradas.",
  },
};

export function GoogleIntegracao({
  configurado,
  conexao,
  pendencias,
  calendarios,
  resultado,
}: {
  configurado: boolean;
  conexao: ConexaoView | null;
  pendencias: number;
  calendarios: CalendarioView[];
  resultado?: string;
}) {
  const router = useRouter();
  const [conectando, setConectando] = useState(false);
  const [salvandoCal, setSalvandoCal] = useState(false);
  const [desconectando, setDesconectando] = useState(false);

  const banner = resultado ? MENSAGENS[resultado] : undefined;

  async function conectar() {
    setConectando(true);
    const r = await conectarGoogleAction();
    if (r.error || !r.url) {
      setConectando(false);
      return toast.error(r.error ?? "Não foi possível iniciar a conexão.");
    }
    // Redireciona ao consentimento do Google (navegação completa).
    window.location.href = r.url;
  }

  async function trocarCalendario(calendarioId: string) {
    setSalvandoCal(true);
    const r = await escolherCalendarioAction(calendarioId);
    setSalvandoCal(false);
    if (r.error) return toast.error(r.error);
    toast.success("Calendário atualizado.");
    router.refresh();
  }

  async function desconectar() {
    setDesconectando(true);
    const r = await desconectarGoogleAction();
    setDesconectando(false);
    if (r.error) return toast.error(r.error);
    toast.success("Conta desconectada.");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-brand/10 text-brand">
            <CalendarIcon className="size-5" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-ink">Google Agenda</h3>
            <p className="text-xs text-ink-muted">
              Espelho de locações e eventos + convites automáticos aos
              locatários.
            </p>
          </div>
        </div>

        {banner ? (
          <div
            className={`flex items-start gap-2 rounded-lg border p-3 text-sm ${
              banner.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-800"
            }`}
          >
            {banner.ok ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0" />
            ) : (
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            )}
            <span>{banner.texto}</span>
          </div>
        ) : null}

        {!configurado ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-ink-muted">
            Aguardando configuração das credenciais do Google (variáveis de
            ambiente). Assim que forem definidas, a conexão fica disponível aqui.
          </div>
        ) : !conexao ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-muted">
              Nenhuma conta conectada. Conecte a conta do Google Agenda da ACIMM
              para começar a espelhar a agenda.
            </p>
            <Button
              className="w-fit"
              loading={conectando}
              onClick={conectar}
            >
              <Link2 className="size-4" />
              Conectar conta Google
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-ink">
                  {conexao.contaEmail || "Conta conectada"}
                </span>
                {conexao.status === "ativa" ? (
                  <Badge variant="secondary">
                    <CheckCircle2 className="size-3" />
                    Ativa
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <AlertTriangle className="size-3" />
                    Expirada
                  </Badge>
                )}
              </div>
              <p className="text-xs text-ink-muted">
                Atualizada em {dataSP(conexao.atualizadoEm)} às{" "}
                {horaSP(conexao.atualizadoEm)}
              </p>
              <p className="text-xs text-ink-muted">
                {pendencias > 0
                  ? `${pendencias} item(ns) aguardando espelho — serão despachados no próximo ciclo.`
                  : "Sem pendências de espelho."}
              </p>
            </div>

            {conexao.status === "expirada" ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <span>
                  A autorização do Google expirou ou foi revogada. As pendências
                  acumulam até você reconectar a conta.
                </span>
              </div>
            ) : null}

            {conexao.status === "ativa" ? (
              <label className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-ink">
                  Calendário alvo
                </span>
                <select
                  className="h-9 rounded-md border bg-surface px-3 text-sm text-ink disabled:opacity-50"
                  value={conexao.calendarioId}
                  disabled={salvandoCal || calendarios.length === 0}
                  onChange={(e) => trocarCalendario(e.target.value)}
                >
                  {calendarios.length === 0 ? (
                    <option value={conexao.calendarioId}>
                      {conexao.calendarioId}
                    </option>
                  ) : (
                    calendarios.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.summary}
                        {c.primary ? " (principal)" : ""}
                      </option>
                    ))
                  )}
                </select>
                <span className="text-xs text-ink-muted">
                  Onde as locações aprovadas e os eventos internos aparecem.
                </span>
              </label>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                loading={conectando}
                onClick={conectar}
              >
                <RefreshCw className="size-4" />
                Reconectar
              </Button>

              <AlertDialog>
                <AlertDialogTrigger
                  render={
                    <Button variant="outline" disabled={desconectando}>
                      <Link2Off className="size-4" />
                      Desconectar
                    </Button>
                  }
                />
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Desconectar o Google Agenda?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Novos eventos deixam de ser espelhados até você reconectar.
                      As pendências continuam acumulando. A autorização é revogada
                      no Google.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      loading={desconectando}
                      onClick={desconectar}
                    >
                      Desconectar
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
