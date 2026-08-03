import type { Metadata } from "next";
import Link from "next/link";
import { requireColaborador } from "@/lib/auth/guards";
import type { OrigemComissao } from "@/lib/comissoes/comissoes-core";
import {
  carregarReconciliacao,
  carregarVisaoComissoes,
  lerConfigComissoes,
} from "@/lib/comissoes/dados";
import { VISAO_ROTULO, VISOES_COMISSAO } from "@/lib/comissoes/tipos";
import type { VisaoComissao } from "@/lib/comissoes/tipos";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { ORIGENS_COMISSAO } from "@/lib/validacoes/comissoes";
import { ComissoesTabela } from "./comissoes-tabela";
import { ConfigComissoes } from "./config-comissoes";
import { ExportarBotao } from "./exportar-botao";
import { FiltrosComissoes as FiltrosBar } from "./filtros-comissoes";
import { ReconciliacaoBanner } from "./reconciliacao-banner";

export const metadata: Metadata = { title: "Comissões" };
export const dynamic = "force-dynamic";

function texto(v: string | string[] | undefined): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function mesBR(mes: string): string {
  const [ano, m] = mes.split("-");
  return `${m}/${ano}`;
}

export default async function ComissoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { colaborador } = await requireColaborador();
  const ehAdmin = colaborador.role === "admin";
  const sp = await searchParams;

  const visaoParam = texto(sp.visao);
  const visao: VisaoComissao = VISOES_COMISSAO.includes(
    visaoParam as VisaoComissao,
  )
    ? (visaoParam as VisaoComissao)
    : "a_pagar";

  const origemParam = texto(sp.origem);
  const origem = ORIGENS_COMISSAO.includes(origemParam as OrigemComissao)
    ? (origemParam as OrigemComissao)
    : null;
  const busca = texto(sp.q);

  const [dados, reconc, config] = await Promise.all([
    carregarVisaoComissoes(visao, { origem, busca }),
    carregarReconciliacao(),
    lerConfigComissoes(),
  ]);

  const paramsAtuais: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v.length > 0) paramsAtuais[k] = v;
  }

  const nadaConfigurado = !config.locacao.ativo && !config.coffee.ativo;

  function hrefVisao(v: VisaoComissao): string {
    const p = new URLSearchParams(paramsAtuais);
    p.set("visao", v);
    return `/admin/comissoes?${p.toString()}`;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Comissões
          </h2>
          <p className="text-sm text-ink-muted">
            Geradas no recebimento do pagamento. Pagas ao colaborador no mês
            seguinte à quitação.
          </p>
        </div>
        <ExportarBotao
          filtros={{ visao, origem, busca }}
          vazio={dados.linhas.length === 0}
        />
      </div>

      {nadaConfigurado ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Nenhuma origem de comissão está ativa
          {ehAdmin
            ? " — defina os percentuais abaixo para que novas quitações passem a gerar comissões."
            : " — peça a um administrador para definir os percentuais."}
        </div>
      ) : null}

      <ReconciliacaoBanner
        pendentes={reconc.pendentes.length}
        revisaoParcial={reconc.revisaoParcial.length}
      />

      {/* Abas de visão */}
      <div className="flex flex-wrap gap-1 border-b">
        {VISOES_COMISSAO.map((v) => (
          <Link
            key={v}
            href={hrefVisao(v)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm ${
              v === visao
                ? "border-brand font-medium text-ink"
                : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            {VISAO_ROTULO[v]}
          </Link>
        ))}
      </div>

      <FiltrosBar params={paramsAtuais} />

      {/* Totais da visão */}
      <div className="grid gap-3 sm:grid-cols-3">
        {dados.ehPrevisao ? (
          <>
            <TotalCard
              titulo="Previsto (total)"
              valor={dados.totais.geral}
              sub={`Locação ${centavosParaBRL(dados.totais.locacao)} · Coffee ${centavosParaBRL(dados.totais.coffee)}`}
            />
            <TotalCard
              titulo="Pagamento previsto"
              valor={null}
              sub={`Em ${mesBR(dados.mesPagamento)} · estimativa (não gravada)`}
            />
            <div className="rounded-lg border p-3">
              <p className="text-xs text-ink-muted">Observação</p>
              <p className="mt-1 text-xs text-ink-muted">
                Valores projetados dos pagamentos previstos; confirmam-se na
                quitação.
              </p>
            </div>
          </>
        ) : (
          <>
            <TotalCard titulo="A pagar" valor={dados.totais.naoPagoCentavos} />
            <TotalCard titulo="Já pagas" valor={dados.totais.pagoCentavos} />
            <TotalCard
              titulo="Total do recorte"
              valor={dados.totais.geral}
              sub={`Pagamento em ${mesBR(dados.mesPagamento)}`}
            />
          </>
        )}
      </div>

      <ComissoesTabela linhas={dados.linhas} ehPrevisao={dados.ehPrevisao} />

      <p className="text-xs text-ink-muted">
        {dados.totais.qtd} {dados.totais.qtd === 1 ? "linha" : "linhas"} nesta
        visão.
      </p>

      {ehAdmin ? <ConfigComissoes configInicial={config} /> : null}
    </div>
  );
}

function TotalCard({
  titulo,
  valor,
  sub,
}: {
  titulo: string;
  valor: number | null;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-ink-muted">{titulo}</p>
      <p className="mt-1 text-lg font-semibold text-ink">
        {valor === null ? "—" : centavosParaBRL(valor)}
      </p>
      {sub ? <p className="mt-1 text-xs text-ink-muted">{sub}</p> : null}
    </div>
  );
}
