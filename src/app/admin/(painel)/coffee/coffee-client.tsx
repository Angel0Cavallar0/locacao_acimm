"use client";

import { Clock, Download, Settings2, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { dataSP, horaSP } from "@/lib/calendario/tempo";
import { adicionarDiasISO, segundaDaSemana } from "@/lib/coffee/periodo";
import { formatarQuantidade } from "@/lib/coffee/tipos";
import { rotuloLocacao } from "@/lib/locacoes/tipos";
import { cn } from "@/lib/utils";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { StatusBadge } from "../locacoes/status-badge";
import {
  gerarPdfComprasAction,
  listarPedidosAction,
  type PedidosResposta,
  salvarAntecedenciaCoffeeAction,
} from "./actions";

export function CoffeeClient({
  inicial,
  hojeISO,
  antecedenciaDias,
}: {
  inicial: PedidosResposta;
  hojeISO: string;
  antecedenciaDias: number;
}) {
  const [inicioData, setInicioData] = useState(inicial.intervalo.inicioData);
  const [fimData, setFimData] = useState(inicial.intervalo.fimData);
  const [incluirPendentes, setIncluirPendentes] = useState(
    inicial.incluirPendentes,
  );
  const [dados, setDados] = useState<PedidosResposta>(inicial);
  const [carregando, setCarregando] = useState(false);
  const [baixando, setBaixando] = useState(false);
  const [antecedencia, setAntecedencia] = useState(String(antecedenciaDias));
  const [salvandoAntec, setSalvandoAntec] = useState(false);
  const primeira = useRef(true);

  async function salvarAntecedencia() {
    const dias = Number(antecedencia);
    if (!Number.isInteger(dias) || dias < 0 || dias > 365) {
      toast.error("Informe um número de dias entre 0 e 365.");
      return;
    }
    setSalvandoAntec(true);
    const r = await salvarAntecedenciaCoffeeAction(dias);
    setSalvandoAntec(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success("Antecedência do coffee atualizada.");
  }

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    let ativo = true;
    setCarregando(true);
    listarPedidosAction({ inicioData, fimData, incluirPendentes }).then((r) => {
      if (!ativo) return;
      setCarregando(false);
      if ("error" in r) {
        toast.error(r.error);
        return;
      }
      setDados(r);
    });
    return () => {
      ativo = false;
    };
  }, [inicioData, fimData, incluirPendentes]);

  function estaSemana() {
    const seg = segundaDaSemana(hojeISO);
    setInicioData(seg);
    setFimData(adicionarDiasISO(seg, 6));
  }

  function deslocar(dias: number) {
    setInicioData((d) => adicionarDiasISO(d, dias));
    setFimData((d) => adicionarDiasISO(d, dias));
  }

  async function baixarPdf() {
    setBaixando(true);
    const r = await gerarPdfComprasAction({ inicioData, fimData });
    setBaixando(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    const bytes = Uint8Array.from(atob(r.base64), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = r.nome;
    a.click();
    URL.revokeObjectURL(url);
  }

  const { pedidos, consolidado } = dados;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Coffee break
          </h2>
          <p className="text-sm text-ink-muted">
            Pedidos por período e lista de compras consolidada.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/coffee/niveis"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Settings2 className="size-4" />
            Configurar níveis
          </Link>
          <Button size="sm" loading={baixando} onClick={baixarPdf}>
            <Download className="size-4" />
            Gerar PDF de compras
          </Button>
        </div>
      </div>

      {/* Seletor de período */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => deslocar(-7)}>
              ← Semana anterior
            </Button>
            <Button variant="outline" size="sm" onClick={estaSemana}>
              Esta semana
            </Button>
            <Button variant="outline" size="sm" onClick={() => deslocar(7)}>
              Próxima semana →
            </Button>
            <span className="ml-auto inline-flex items-center gap-1.5 text-sm text-ink-muted">
              <SlidersHorizontal className="size-3.5" />
              {dados.intervalo.rotulo}
            </span>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-muted">De</span>
              <DatePicker value={inicioData} onChange={setInicioData} />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-muted">Até</span>
              <DatePicker value={fimData} onChange={setFimData} />
            </div>
            <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={incluirPendentes}
                onChange={(e) => setIncluirPendentes(e.target.checked)}
              />
              <span className="text-ink">Incluir pendentes</span>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Antecedência mínima do coffee */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Clock className="size-4" />
              Antecedência mínima do coffee
            </h3>
            <p className="text-xs text-ink-muted">
              Dias de antecedência exigidos para pedir coffee break. 0 = sem
              restrição. Vale para o portal e o atendimento assistido.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-muted">Dias</span>
              <Input
                type="number"
                min={0}
                max={365}
                value={antecedencia}
                onChange={(e) => setAntecedencia(e.target.value)}
                className="w-24"
              />
            </div>
            <Button
              size="sm"
              loading={salvandoAntec}
              onClick={salvarAntecedencia}
            >
              Salvar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Consolidado */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">
              Consolidado de compras
            </h3>
            <span className="text-xs text-ink-muted">
              {consolidado.qtdPedidos} pedido(s) firme(s) ·{" "}
              {consolidado.totalPessoas} pessoas
            </span>
          </div>
          {consolidado.itens.length === 0 ? (
            <p className="text-sm text-ink-muted">
              Nenhum item de compra no período (pedidos firmes com composição
              cadastrada no nível).
            </p>
          ) : (
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {consolidado.itens.map((it) => (
                <li
                  key={`${it.item}-${it.unidade}`}
                  className="flex justify-between border-b border-dashed py-1 text-sm"
                >
                  <span className="text-ink">{it.item}</span>
                  <span className="font-medium text-ink">
                    {formatarQuantidade(it.quantidade)} {it.unidade}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-ink-muted">
            Adicionais dos pedidos são texto livre e não entram no consolidado.
            Envio automático semanal ao setor de compras: em breve.
          </p>
        </CardContent>
      </Card>

      {/* Tabela de pedidos */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">
              Pedidos do período
            </h3>
            {carregando ? (
              <span className="text-xs text-ink-muted">Carregando…</span>
            ) : (
              <span className="text-xs text-ink-muted">
                {pedidos.length} pedido(s)
              </span>
            )}
          </div>

          {pedidos.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">
              Nenhum coffee break com evento neste período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-ink-muted">
                    <th className="py-2 pr-3 font-medium">Evento</th>
                    <th className="py-2 pr-3 font-medium">Servir</th>
                    <th className="py-2 pr-3 font-medium">Locação</th>
                    <th className="py-2 pr-3 font-medium">Sala(s)</th>
                    <th className="py-2 pr-3 font-medium">Nível</th>
                    <th className="py-2 pr-3 text-right font-medium">Pessoas</th>
                    <th className="py-2 pr-3 font-medium">Adic.</th>
                    <th className="py-2 pr-3 text-right font-medium">Valor</th>
                    <th className="py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map((p) => (
                    <tr
                      key={p.coffeeId}
                      className={cn(
                        "border-b last:border-0",
                        !p.firme && "bg-amber-500/5",
                      )}
                    >
                      <td className="py-2 pr-3 whitespace-nowrap text-ink">
                        {dataSP(p.inicioUtc)}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-ink-muted">
                        {p.horarioServirUtc ? horaSP(p.horarioServirUtc) : "—"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <Link
                          href={`/admin/locacoes/${p.locacaoId}`}
                          className="text-brand hover:underline"
                        >
                          {rotuloLocacao(p.numero)}
                        </Link>
                        <div className="max-w-[10rem] truncate text-xs text-ink-muted">
                          {p.locatario}
                        </div>
                      </td>
                      <td className="max-w-[10rem] truncate py-2 pr-3 text-ink-muted">
                        {p.salas.join(", ") || "—"}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap text-ink">
                        {p.nivelNome || "—"}
                      </td>
                      <td className="py-2 pr-3 text-right text-ink">
                        {p.qtdPessoas}
                      </td>
                      <td className="py-2 pr-3 text-ink-muted">
                        {p.adicionais.length > 0
                          ? `${p.adicionais.length}`
                          : "—"}
                      </td>
                      <td className="py-2 pr-3 text-right whitespace-nowrap text-ink">
                        {centavosParaBRL(p.valorCentavos)}
                      </td>
                      <td className="py-2">
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
