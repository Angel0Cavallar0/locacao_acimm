import { CalendarSearch } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { requireAssociado } from "@/lib/auth/guards";
import { dataSP, horaSP } from "@/lib/calendario/tempo";
import {
  type GrupoStatus,
  grupoStatus,
  STATUS_ROTULO,
} from "@/lib/locacoes/maquina-estados-core";
import { listarMinhasLocacoes } from "@/lib/locacoes/portal-dados";
import type { CardLocacao, TabLocacoes } from "@/lib/locacoes/portal-tipos";
import { rotuloLocacao } from "@/lib/locacoes/tipos";
import { cn } from "@/lib/utils";
import { centavosParaBRL } from "@/lib/utils/moeda";

export const metadata: Metadata = { title: "Minhas locações" };

const TABS: { valor: TabLocacoes; rotulo: string }[] = [
  { valor: "andamento", rotulo: "Em andamento" },
  { valor: "realizadas", rotulo: "Realizadas" },
  { valor: "encerradas", rotulo: "Encerradas" },
  { valor: "todas", rotulo: "Todas" },
];
const VALIDAS = new Set(TABS.map((t) => t.valor));

const BADGE: Record<GrupoStatus, string> = {
  rascunho: "bg-surface-muted text-ink-muted",
  pendente: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  andamento: "bg-brand/10 text-brand",
  concluida: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  encerrada: "bg-surface-muted text-ink-muted",
};

function CardLocacaoView({ loc }: { loc: CardLocacao }) {
  return (
    <Link href={`/locacoes/${loc.id}`}>
      <Card className="transition-colors hover:bg-surface-muted">
        <CardContent className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">
              {loc.salas.join(" · ") || "Locação"}
            </p>
            <p className="text-xs text-ink-muted">
              {dataSP(loc.inicioUtc)} · {horaSP(loc.inicioUtc)}–
              {horaSP(loc.fimUtc)}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {rotuloLocacao(loc.numero)} ·{" "}
              {centavosParaBRL(loc.valorTotalCentavos)}
            </p>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium",
              BADGE[grupoStatus(loc.status)],
            )}
          >
            {STATUS_ROTULO[loc.status]}
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}

export default async function MinhasLocacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { associado } = await requireAssociado();
  const sp = await searchParams;
  const t = typeof sp.tab === "string" ? sp.tab : "";
  const tab: TabLocacoes = VALIDAS.has(t as TabLocacoes)
    ? (t as TabLocacoes)
    : "andamento";

  const locacoes = await listarMinhasLocacoes(associado.id, tab);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          Minhas locações
        </h2>
        <p className="text-sm text-ink-muted">
          Acompanhe o status das suas solicitações.
        </p>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {TABS.map((it) => (
          <Link
            key={it.valor}
            href={`/locacoes?tab=${it.valor}`}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
              tab === it.valor
                ? "border-brand bg-brand/10 text-brand"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {it.rotulo}
          </Link>
        ))}
      </div>

      {locacoes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-ink-muted">
              Você ainda não tem locações nesta aba.
            </p>
            <Link
              href="/disponibilidade"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:bg-brand/90"
            >
              <CalendarSearch className="size-4" />
              Ver disponibilidade
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-2">
          {locacoes.map((loc) => (
            <CardLocacaoView key={loc.id} loc={loc} />
          ))}
        </div>
      )}
    </div>
  );
}
