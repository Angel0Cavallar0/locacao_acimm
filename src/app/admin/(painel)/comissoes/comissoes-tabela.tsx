"use client";

import { Check, Clock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dataSP } from "@/lib/calendario/tempo";
import type { OrigemComissao } from "@/lib/comissoes/comissoes-core";
import type { ComissaoLinha } from "@/lib/comissoes/tipos";
import { FORMA_PAGAMENTO_ROTULO, rotuloLocacao } from "@/lib/locacoes/tipos";
import type { FormaPagamento } from "@/lib/locacoes/tipos";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { marcarComissoesPagasAction } from "./actions";

const ORIGEM_ROTULO: Record<OrigemComissao, string> = {
  locacao: "Locação",
  coffee: "Coffee break",
};

function rotuloForma(forma: string | null): string {
  if (!forma) return "—";
  if (forma === "multiplas") return "Múltiplas formas";
  return FORMA_PAGAMENTO_ROTULO[forma as FormaPagamento] ?? forma;
}

function competenciaBR(c: string): string {
  const [ano, mes] = c.split("-");
  return `${mes}/${ano}`;
}

export function ComissoesTabela({
  linhas,
  ehPrevisao,
}: {
  linhas: ComissaoLinha[];
  ehPrevisao: boolean;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  function marcar(ids: string[], pago: boolean) {
    iniciar(async () => {
      const r = await marcarComissoesPagasAction({ ids, pago });
      if ("erro" in r) {
        toast.error(r.erro);
        return;
      }
      toast.success(
        pago
          ? `${r.alteradas} comissão(ões) marcada(s) como paga(s).`
          : `${r.alteradas} comissão(ões) reaberta(s).`,
      );
      router.refresh();
    });
  }

  // Só competência FECHADA libera pagamento: em mês aberto o percentual ainda
  // pode mudar e o valor pago divergiria do gravado (Spec 33 §7.4).
  const elegiveis = linhas.filter(
    (l) => l.tipo === "real" && !l.pago && l.competenciaFechada,
  );
  const bloqueadas = linhas.filter(
    (l) => l.tipo === "real" && !l.pago && !l.competenciaFechada,
  );

  return (
    <div className="flex flex-col gap-2">
      {elegiveis.length > 0 || bloqueadas.length > 0 ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {bloqueadas.length > 0 ? (
            <p className="text-xs text-ink-muted">
              {bloqueadas.length} em competência aberta — feche a competência
              para liberar o pagamento.
            </p>
          ) : null}
          {elegiveis.length > 0 ? (
            <Button
              variant="outline"
              size="sm"
              loading={pendente}
              onClick={() => marcar(elegiveis.map((l) => l.id), true)}
            >
              <Check className="size-4" />
              Marcar todas como pagas ({elegiveis.length})
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Locação</TableHead>
              <TableHead>Locatário</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead className="text-right">Base</TableHead>
              <TableHead className="text-right">%</TableHead>
              <TableHead className="text-right">Comissão</TableHead>
              <TableHead>Recebido em</TableHead>
              <TableHead>Forma</TableHead>
              <TableHead>Competência</TableHead>
              <TableHead className="text-right">
                {ehPrevisao ? "Situação" : "Pago"}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={10}
                  className="py-8 text-center text-sm text-ink-muted"
                >
                  Nenhuma comissão nesta visão.
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
                  <TableCell>
                    <Badge variant="outline">{ORIGEM_ROTULO[l.origem]}</Badge>
                  </TableCell>
                  <TableCell className="text-right text-ink-muted">
                    {centavosParaBRL(l.baseCentavos)}
                  </TableCell>
                  <TableCell className="text-right text-ink-muted">
                    {l.percentual}%
                  </TableCell>
                  <TableCell className="text-right font-medium text-ink">
                    {centavosParaBRL(l.valorCentavos)}
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {l.recebidoEmUtc ? dataSP(l.recebidoEmUtc) : "—"}
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {rotuloForma(l.formaPagamento)}
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    <span className="whitespace-nowrap">
                      {competenciaBR(l.competencia)}
                    </span>
                    {l.competenciaOriginal ? (
                      <Badge
                        variant="secondary"
                        className="ml-1"
                        title={`Recebido em ${competenciaBR(l.competenciaOriginal)} · competência já fechada`}
                      >
                        deslocada
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right">
                    {l.tipo === "previsao" ? (
                      <Badge variant="secondary" className="gap-1">
                        <Clock className="size-3" />
                        Previsão
                      </Badge>
                    ) : l.pago ? (
                      <button
                        type="button"
                        disabled={pendente}
                        onClick={() => marcar([l.id], false)}
                        title="Clique para reabrir"
                      >
                        <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-700">
                          <Check className="size-3" />
                          Paga
                        </Badge>
                      </button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pendente || !l.competenciaFechada}
                        title={
                          l.competenciaFechada
                            ? undefined
                            : `Feche a competência ${competenciaBR(l.competencia)} para liberar o pagamento`
                        }
                        onClick={() => marcar([l.id], true)}
                      >
                        Marcar paga
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
