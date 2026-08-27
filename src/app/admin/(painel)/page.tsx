import { CalendarDays, FileClock, Gift, History, Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { requireColaborador } from "@/lib/auth/guards";
import { dataSP, horaSP } from "@/lib/calendario/tempo";
import { carregarDashboard } from "@/lib/dashboard/dados";
import type {
  CardsIndicadores,
  DashboardData,
  LocacaoResumo,
  OcupacaoSala,
} from "@/lib/dashboard/tipos";
import { rotuloLocacao } from "@/lib/locacoes/tipos";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { AcaoNecessaria } from "./acao-necessaria";
import { ExportarMesButton } from "./exportar-mes-button";
import { ReceitaPeriodoForm } from "./receita-periodo-form";
import { StatusBadge } from "./locacoes/status-badge";
import { RefreshOnFocus } from "./refresh-on-focus";

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;

function texto(v: string | string[] | undefined): string | null {
  return typeof v === "string" && DATA_RE.test(v) ? v : null;
}

export const metadata: Metadata = { title: "Dashboard" };
// Operacional: sempre fresco (reflete a baixa que acabou de acontecer — §6).
export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireColaborador();
  const sp = await searchParams;
  const receitaDeISO = texto(sp.rde) ?? undefined;
  const receitaAteISO = texto(sp.rate) ?? undefined;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <RefreshOnFocus />
      {/* Skeleton por seção durante a agregação (§6), sem vazar p/ outras rotas. */}
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardConteudo
          receitaDeISO={receitaDeISO}
          receitaAteISO={receitaAteISO}
        />
      </Suspense>
    </div>
  );
}

async function DashboardConteudo({
  receitaDeISO,
  receitaAteISO,
}: {
  receitaDeISO?: string;
  receitaAteISO?: string;
}) {
  const d = await carregarDashboard({ receitaDeISO, receitaAteISO });
  return (
    <>
      <AcaoNecessaria acoes={d.acoes} />

      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-ink-muted">
          Indicadores · {d.mesRotulo}
        </p>
        <CardsGrid cards={d.cards} />
      </div>

      <ReceitaPanel d={d} />

      <div className="grid gap-4 lg:grid-cols-2">
        <ProximasLocacoes proximas={d.proximas} total={d.cards.locacoesSemana} />
        <OcupacaoSalas salas={d.ocupacaoSalas} />
      </div>
    </>
  );
}

/**
 * Painel de receita (Spec 32 §1.1/§1.4/§1.3): salas × coffee separados, filtro
 * de período (form GET → searchParams), exportação PDF e atalho ao histórico.
 */
function ReceitaPanel({ d }: { d: DashboardData }) {
  const c = d.cards;
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-ink">
            Receita · {d.receitaPeriodoRotulo}
          </h2>
          <div className="flex items-center gap-2">
            <ExportarMesButton deISO={d.receitaDeISO} ateISO={d.receitaAteISO} />
            <Link
              href="/admin/locacoes?vista=todas"
              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-sm text-ink transition-colors hover:bg-surface-muted"
            >
              <History className="size-4" /> Histórico
            </Link>
          </div>
        </div>

        <ReceitaPeriodoForm
          deInicial={d.receitaDeISO}
          ateInicial={d.receitaAteISO}
        />

        <div className="grid grid-cols-3 gap-3">
          <ValorBloco rotulo="Salas" valor={c.receitaSalasCentavos} />
          <ValorBloco rotulo="Coffee break" valor={c.receitaCoffeeCentavos} />
          <ValorBloco rotulo="Total" valor={c.receitaMesCentavos} destaque />
        </div>
        <p className="text-xs text-ink-muted">
          {c.receitaQuantidade} locação(ões) arrecadada(s)
          {c.pipelineMesCentavos > 0
            ? ` · + ${centavosParaBRL(c.pipelineMesCentavos)} em andamento`
            : ""}
          .
        </p>
      </CardContent>
    </Card>
  );
}

function ValorBloco({
  rotulo,
  valor,
  destaque,
}: {
  rotulo: string;
  valor: number;
  destaque?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <p className="text-xs text-ink-muted">{rotulo}</p>
      <p
        className={
          destaque
            ? "text-xl font-semibold text-brand"
            : "text-xl font-semibold text-ink"
        }
      >
        {centavosParaBRL(valor)}
      </p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-4" aria-hidden>
      <div className="h-40 rounded-xl border bg-surface-muted/50" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 rounded-xl border bg-surface-muted/50" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-56 rounded-xl border bg-surface-muted/50" />
        <div className="h-56 rounded-xl border bg-surface-muted/50" />
      </div>
    </div>
  );
}

function Indicador({
  titulo,
  valor,
  subtexto,
  icone,
  href,
  tooltip,
}: {
  titulo: string;
  valor: string;
  subtexto?: string;
  icone: React.ReactNode;
  href?: string;
  tooltip?: string;
}) {
  const conteudo = (
    <div className="flex h-full flex-col gap-1 rounded-xl border bg-card p-3 transition-colors hover:bg-surface-muted">
      <div className="flex items-center gap-1.5 text-ink-muted">
        {icone}
        <span className="text-xs font-medium">{titulo}</span>
        {tooltip ? (
          <span title={tooltip} className="cursor-help">
            <Info className="size-3" />
          </span>
        ) : null}
      </div>
      <p className="text-xl font-semibold text-ink">{valor}</p>
      {subtexto ? <p className="text-xs text-ink-muted">{subtexto}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block">
      {conteudo}
    </Link>
  ) : (
    conteudo
  );
}

function CardsGrid({ cards }: { cards: CardsIndicadores }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Indicador
        titulo="Pendentes"
        valor={String(cards.pendentesAprovacao)}
        subtexto="aguardando análise"
        icone={<FileClock className="size-4" />}
        href="/admin/locacoes?vista=pendentes"
      />
      <Indicador
        titulo="Semana"
        valor={String(cards.locacoesSemana)}
        subtexto="próximos 7 dias"
        icone={<CalendarDays className="size-4" />}
        href="/admin/locacoes?vista=proximas"
      />
    </div>
  );
}

function ProximasLocacoes({
  proximas,
  total,
}: {
  proximas: LocacaoResumo[];
  total: number;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-sm font-semibold text-ink">
            Próximas locações da semana
          </h2>
          {total > proximas.length ? (
            <Link
              href="/admin/locacoes?vista=proximas"
              className="text-xs text-brand hover:underline"
            >
              ver todas ({total})
            </Link>
          ) : null}
        </div>
        {proximas.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            Nenhuma locação nos próximos 7 dias.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {proximas.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/admin/locacoes/${l.id}`}
                  className="flex items-center gap-3 rounded-md px-1 py-2 transition-colors hover:bg-surface-muted"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-ink">
                      {l.salas.join(", ") || rotuloLocacao(l.numero)}
                    </p>
                    <p className="truncate text-xs text-ink-muted">
                      {dataSP(l.inicioUtc)} · {horaSP(l.inicioUtc)}–
                      {horaSP(l.fimUtc)} · {l.locatario}
                    </p>
                  </div>
                  <StatusBadge status={l.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function OcupacaoSalas({ salas }: { salas: OcupacaoSala[] }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <h2 className="font-display text-sm font-semibold text-ink">
          Locações por sala (mês)
        </h2>
        {salas.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            Nenhuma sala ativa.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {salas.map((s) => (
              <div
                key={s.salaId}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="flex items-center gap-1 truncate text-ink">
                  <span className="truncate">{s.nome}</span>
                  {s.temPeriodoGratuito ? (
                    <span title="Sala com período gratuito ativo">
                      <Gift className="size-3 shrink-0 text-brand" />
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs font-medium text-ink">
                  {s.locacoesQtd} locação{s.locacoesQtd === 1 ? "" : "ões"}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
