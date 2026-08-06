import type { Metadata } from "next";
import Link from "next/link";
import { requireColaborador } from "@/lib/auth/guards";
import type { CondicaoLocatario } from "@/lib/dominio";
import {
  type FiltrosLista,
  listarLocacoes,
  POR_PAGINA,
  type VistaLista,
} from "@/lib/locacoes/dados";
import type { FormaPagamento } from "@/lib/locacoes/tipos";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { FiltrosBar } from "./filtros-bar";
import { LocacoesTabela } from "./locacoes-tabela";

export const metadata: Metadata = { title: "Locações" };

// "Todas" é a visão padrão/primária; as demais são atalhos secundários.
const VISTAS_SECUNDARIAS: { valor: VistaLista; rotulo: string }[] = [
  { valor: "pendentes", rotulo: "Pendentes" },
  { valor: "andamento", rotulo: "Em andamento" },
  { valor: "proximas", rotulo: "Próximas 7 dias" },
];

const FORMAS_VALIDAS = new Set<FormaPagamento>([
  "pix",
  "transferencia",
  "cartao",
  "dinheiro",
  "boleto_avulso",
  "boleto_mensalidade",
  "isento",
]);

function texto(v: string | string[] | undefined): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export default async function LocacoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireColaborador();
  const sp = await searchParams;
  const supabase = await createClient();

  const vista = (
    ["pendentes", "andamento", "proximas", "todas"] as VistaLista[]
  ).includes(sp.vista as VistaLista)
    ? (sp.vista as VistaLista)
    : "todas";

  const cond = texto(sp.cond);
  const forma = texto(sp.forma);
  const filtros: FiltrosLista = {
    vista,
    salaId: texto(sp.sala),
    condicao:
      cond === "associado" || cond === "nao_associado"
        ? (cond as CondicaoLocatario)
        : null,
    forma: forma && FORMAS_VALIDAS.has(forma as FormaPagamento)
      ? (forma as FormaPagamento)
      : null,
    dataDe: texto(sp.de),
    dataAte: texto(sp.ate),
    busca: texto(sp.q),
    pagina: Math.max(1, Number.parseInt(String(sp.pag ?? "1"), 10) || 1),
  };

  const [{ linhas, total }, { data: salas }] = await Promise.all([
    listarLocacoes(filtros),
    supabase
      .from("salas")
      .select("id, nome")
      .is("excluida_em", null)
      .order("ordem", { ascending: true }),
  ]);

  // Record das query strings atuais (para preservar em links/filtros).
  const paramsAtuais: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v.length > 0) paramsAtuais[k] = v;
  }

  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const linkVista = (v: VistaLista) => {
    const p = new URLSearchParams(paramsAtuais);
    p.set("vista", v);
    p.delete("pag");
    return `/admin/locacoes?${p.toString()}`;
  };
  const linkPagina = (n: number) => {
    const p = new URLSearchParams(paramsAtuais);
    p.set("pag", String(n));
    return `/admin/locacoes?${p.toString()}`;
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Locações
          </h2>
          <p className="text-sm text-ink-muted">
            Acompanhe e opere o ciclo de vida de cada locação.
          </p>
        </div>
        <Link
          href="/admin/locacoes/nova"
          className="inline-flex h-8 items-center rounded-lg bg-brand px-3 text-sm font-medium text-brand-foreground hover:bg-brand/90"
        >
          Nova locação
        </Link>
      </div>

      {/* "Todas" como visão primária; atalhos rápidos secundários ao lado */}
      <div className="flex flex-wrap items-center gap-2 border-b pb-2">
        <Link
          href={linkVista("todas")}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
            vista === "todas"
              ? "bg-brand text-brand-foreground"
              : "text-ink-muted hover:bg-surface-muted hover:text-ink",
          )}
        >
          Todas
        </Link>
        <span className="mx-0.5 h-4 w-px bg-border" />
        <span className="text-xs text-ink-muted">Atalhos:</span>
        {VISTAS_SECUNDARIAS.map((v) => (
          <Link
            key={v.valor}
            href={linkVista(v.valor)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              vista === v.valor
                ? "border-brand bg-brand/10 text-brand"
                : "border-border text-ink-muted hover:text-ink",
            )}
          >
            {v.rotulo}
          </Link>
        ))}
      </div>

      <FiltrosBar salas={salas ?? []} params={paramsAtuais} />

      <LocacoesTabela linhas={linhas} />

      <div className="flex items-center justify-between text-sm text-ink-muted">
        <span>
          {total} {total === 1 ? "locação" : "locações"}
        </span>
        {totalPaginas > 1 ? (
          <div className="flex items-center gap-2">
            {filtros.pagina > 1 ? (
              <Link
                href={linkPagina(filtros.pagina - 1)}
                className="rounded-md border px-2 py-1 hover:bg-surface-muted"
              >
                Anterior
              </Link>
            ) : (
              <span className="cursor-not-allowed rounded-md border px-2 py-1 opacity-40">
                Anterior
              </span>
            )}
            <span>
              {filtros.pagina} / {totalPaginas}
            </span>
            {filtros.pagina < totalPaginas ? (
              <Link
                href={linkPagina(filtros.pagina + 1)}
                className="rounded-md border px-2 py-1 hover:bg-surface-muted"
              >
                Próxima
              </Link>
            ) : (
              <span className="cursor-not-allowed rounded-md border px-2 py-1 opacity-40">
                Próxima
              </span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
