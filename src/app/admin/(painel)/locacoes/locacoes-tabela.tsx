"use client";

import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { dataSP, horaSP } from "@/lib/calendario/tempo";
import { mostraPagamentoPendente } from "@/lib/locacoes/maquina-estados-core";
import {
  FORMA_PAGAMENTO_ROTULO,
  type LocacaoLista,
  rotuloLocacao,
} from "@/lib/locacoes/tipos";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { PagamentoPendenteBadge, StatusBadge } from "./status-badge";

export function LocacoesTabela({ linhas }: { linhas: LocacaoLista[] }) {
  const router = useRouter();

  if (linhas.length === 0) {
    return (
      <div className="rounded-lg border py-12 text-center text-sm text-ink-muted">
        Nenhuma locação encontrada com esses filtros.
      </div>
    );
  }

  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nº</TableHead>
            <TableHead>Evento</TableHead>
            <TableHead>Locatário</TableHead>
            <TableHead>Sala(s)</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Total</TableHead>
            <TableHead>Pagamento</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map((l) => (
            <TableRow
              key={l.id}
              className="cursor-pointer"
              onClick={() => router.push(`/admin/locacoes/${l.id}`)}
            >
              <TableCell className="font-medium text-ink">
                {rotuloLocacao(l.numero)}
              </TableCell>
              <TableCell>
                <div className="text-ink">{dataSP(l.inicioUtc)}</div>
                <div className="text-xs text-ink-muted">
                  {horaSP(l.inicioUtc)}–{horaSP(l.fimUtc)}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <span className="max-w-[16rem] truncate text-ink">
                    {l.locatario}
                  </span>
                  <Badge
                    variant={l.condicao === "associado" ? "secondary" : "outline"}
                  >
                    {l.condicao === "associado" ? "Associado" : "Externo"}
                  </Badge>
                </div>
              </TableCell>
              <TableCell className="max-w-[14rem] truncate text-ink-muted">
                {l.salas.join(", ") || "—"}
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap items-center gap-1">
                  <StatusBadge status={l.status} />
                  {l.pagamentoPendente && mostraPagamentoPendente(l.status) ? (
                    <PagamentoPendenteBadge />
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-right text-ink">
                {centavosParaBRL(l.valorTotalCentavos)}
              </TableCell>
              <TableCell className="text-ink-muted">
                {l.formaPagamento
                  ? FORMA_PAGAMENTO_ROTULO[l.formaPagamento]
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
