import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireColaborador } from "@/lib/auth/guards";
import { dataSP } from "@/lib/calendario/tempo";
import {
  calcularTotais,
  carregarComissoes,
  competenciasDisponiveis,
  type FiltrosComissoes,
  lerConfigComissoes,
  type StatusFiltroComissao,
} from "@/lib/comissoes/dados";
import type { OrigemComissao } from "@/lib/comissoes/comissoes-core";
import { rotuloLocacao } from "@/lib/locacoes/tipos";
import { centavosParaBRL } from "@/lib/utils/moeda";
import {
  ORIGENS_COMISSAO,
  STATUS_COMISSAO,
} from "@/lib/validacoes/comissoes";
import { ConfigComissoes } from "./config-comissoes";
import { ExportarBotao } from "./exportar-botao";
import { FiltrosComissoes as FiltrosBar } from "./filtros-comissoes";

export const metadata: Metadata = { title: "Comissões" };

const ORIGEM_ROTULO: Record<OrigemComissao, string> = {
  locacao: "Locação",
  coffee: "Coffee break",
};

function texto(v: string | string[] | undefined): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export default async function ComissoesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { colaborador } = await requireColaborador();
  const ehAdmin = colaborador.role === "admin";
  const sp = await searchParams;

  const compParam = texto(sp.comp);
  const origemParam = texto(sp.origem);
  const statusParam = texto(sp.status);

  const filtros: FiltrosComissoes = {
    competencia: compParam && /^\d{4}-\d{2}$/.test(compParam) ? compParam : null,
    origem: ORIGENS_COMISSAO.includes(origemParam as OrigemComissao)
      ? (origemParam as OrigemComissao)
      : null,
    status: STATUS_COMISSAO.includes(statusParam as StatusFiltroComissao)
      ? (statusParam as StatusFiltroComissao)
      : null,
    busca: texto(sp.q),
  };

  const [linhas, competencias, config] = await Promise.all([
    carregarComissoes(filtros),
    competenciasDisponiveis(),
    lerConfigComissoes(),
  ]);
  const totais = calcularTotais(linhas);

  const paramsAtuais: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v.length > 0) paramsAtuais[k] = v;
  }

  const nadaConfigurado =
    !config.locacao.ativo && !config.coffee.ativo;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Comissões
          </h2>
          <p className="text-sm text-ink-muted">
            Geradas na confirmação de cada locação. Exporte o CSV para o seu
            controle.
          </p>
        </div>
        <ExportarBotao
          filtros={{
            competencia: filtros.competencia,
            origem: filtros.origem,
            status: filtros.status,
            busca: filtros.busca,
          }}
          vazio={linhas.length === 0}
        />
      </div>

      {nadaConfigurado ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          Nenhuma origem de comissão está ativa
          {ehAdmin
            ? " — defina os percentuais abaixo para que novas confirmações passem a gerar comissões."
            : " — peça a um administrador para definir os percentuais."}
        </div>
      ) : null}

      <FiltrosBar competencias={competencias} params={paramsAtuais} />

      {/* Totais do recorte */}
      <div className="grid gap-3 sm:grid-cols-3">
        <TotalCard
          titulo="A exportar"
          geral={totais.pendentes.geral}
          locacao={totais.pendentes.locacao}
          coffee={totais.pendentes.coffee}
        />
        <TotalCard
          titulo="Exportadas"
          geral={totais.exportadas.geral}
          locacao={totais.exportadas.locacao}
          coffee={totais.exportadas.coffee}
        />
        <div className="rounded-lg border p-3">
          <p className="text-xs text-ink-muted">Estornadas</p>
          <p className="mt-1 text-lg font-semibold text-ink">
            {centavosParaBRL(totais.estornadasCentavos)}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {totais.estornadasExportadasQtd > 0
              ? `${totais.estornadasExportadasQtd} após exportação`
              : "nenhuma após exportação"}
          </p>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Locação</TableHead>
              <TableHead>Locatário</TableHead>
              <TableHead>Data do evento</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead className="text-right">Base</TableHead>
              <TableHead className="text-right">Comissão</TableHead>
              <TableHead>Competência</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={8}
                  className="py-8 text-center text-sm text-ink-muted"
                >
                  Nenhuma comissão neste recorte.
                </TableCell>
              </TableRow>
            ) : (
              linhas.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <Link
                      href={`/admin/locacoes/${l.locacaoId}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {rotuloLocacao(l.numero)}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-40 truncate" title={l.locatario}>
                    {l.locatario}
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {l.dataEventoUtc ? dataSP(l.dataEventoUtc) : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{ORIGEM_ROTULO[l.origem]}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-ink-muted">
                    {centavosParaBRL(l.baseCentavos)}
                  </TableCell>
                  <TableCell className="text-right font-medium text-ink">
                    {centavosParaBRL(l.valorCentavos)}
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {l.competencia.split("-").reverse().join("/")}
                  </TableCell>
                  <TableCell>
                    <StatusComissao
                      exportada={l.exportada}
                      estornadaEmUtc={l.estornadaEmUtc}
                    />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-ink-muted">
        {totais.qtd} {totais.qtd === 1 ? "linha" : "linhas"} no recorte atual.
      </p>

      {ehAdmin ? <ConfigComissoes configInicial={config} /> : null}
    </div>
  );
}

function TotalCard({
  titulo,
  geral,
  locacao,
  coffee,
}: {
  titulo: string;
  geral: number;
  locacao: number;
  coffee: number;
}) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-ink-muted">{titulo}</p>
      <p className="mt-1 text-lg font-semibold text-ink">
        {centavosParaBRL(geral)}
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        Locação {centavosParaBRL(locacao)} · Coffee {centavosParaBRL(coffee)}
      </p>
    </div>
  );
}

function StatusComissao({
  exportada,
  estornadaEmUtc,
}: {
  exportada: boolean;
  estornadaEmUtc: string | null;
}) {
  if (estornadaEmUtc) {
    return (
      <div className="flex flex-col gap-0.5">
        <Badge variant="destructive">
          {exportada ? "Estornada (exportada)" : "Estornada"}
        </Badge>
        <span className="text-[11px] text-ink-muted">
          {dataSP(estornadaEmUtc)}
        </span>
      </div>
    );
  }
  return exportada ? (
    <Badge variant="secondary">Exportada</Badge>
  ) : (
    <Badge variant="outline">A exportar</Badge>
  );
}
