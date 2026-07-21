"use client";

import {
  AlertTriangle,
  BellOff,
  FileClock,
  FileX,
  type LucideIcon,
  Receipt,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import type { AcaoNecessaria as Acao, TipoAcao } from "@/lib/dashboard/tipos";

const ICONE: Record<TipoAcao, LucideIcon> = {
  solicitacao: FileClock,
  comprovante: Receipt,
  contrato_recusado: FileX,
  notificacao_falha: BellOff,
  sobreposicao: AlertTriangle,
  vaga_fila: Users,
};

const MAX = 15;

function Item({ acao }: { acao: Acao }) {
  const Icone = ICONE[acao.tipo];
  const corpo = (
    <>
      <Icone className="size-4 shrink-0 text-ink-muted" />
      <span className="flex-1 text-sm text-ink">{acao.texto}</span>
    </>
  );
  if (acao.href) {
    return (
      <Link
        href={acao.href}
        className="flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-surface-muted"
      >
        {corpo}
        <span className="text-xs text-brand">Abrir →</span>
      </Link>
    );
  }
  return <div className="flex items-center gap-3 px-2 py-2">{corpo}</div>;
}

export function AcaoNecessaria({ acoes }: { acoes: Acao[] }) {
  const [expandido, setExpandido] = useState(false);

  if (acoes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-1 py-8 text-center">
          <p className="text-lg font-semibold text-ink">Tudo em dia 🎉</p>
          <p className="text-sm text-ink-muted">
            Nenhuma pendência precisa da sua atenção agora.
          </p>
        </CardContent>
      </Card>
    );
  }

  const visiveis = expandido ? acoes : acoes.slice(0, MAX);
  const resto = acoes.length - MAX;

  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-center justify-between px-2 pb-1">
          <h2 className="font-display text-sm font-semibold text-ink">
            Ação necessária
          </h2>
          <span className="text-xs text-ink-muted">
            {acoes.length} {acoes.length === 1 ? "pendência" : "pendências"}
          </span>
        </div>
        <ul className="divide-y divide-border">
          {visiveis.map((a) => (
            <li key={a.id}>
              <Item acao={a} />
            </li>
          ))}
        </ul>
        {!expandido && resto > 0 ? (
          <button
            type="button"
            onClick={() => setExpandido(true)}
            className="mt-1 self-start px-2 text-xs font-medium text-brand hover:underline"
          >
            + {resto} {resto === 1 ? "outro" : "outros"}
          </button>
        ) : null}
      </CardContent>
    </Card>
  );
}
