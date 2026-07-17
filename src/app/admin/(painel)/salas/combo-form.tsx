"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TIPOS_COMBO, type TipoCombo, type TipoDesconto } from "@/lib/dominio";
import { brlParaCentavos } from "@/lib/utils/moeda";
import type { ComboInput } from "@/lib/validacoes/salas";
import { atualizarCombo, criarCombo } from "./combos-actions";

export interface ComboDados {
  id: string;
  nome: string;
  descricao: string;
  tipo: TipoCombo;
  tipoDesconto: TipoDesconto | null;
  descontoValor: number | null;
  valorCentavos: number | null;
  salas: { salaId: string; aplicaDesconto: boolean }[];
}

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function centavosParaTexto(c: number) {
  return (c / 100).toFixed(2).replace(".", ",");
}

export function ComboForm({
  modo,
  salasDisponiveis,
  combo,
}: {
  modo: "criar" | "editar";
  salasDisponiveis: { id: string; nome: string }[];
  combo?: ComboDados;
}) {
  const router = useRouter();
  const [nome, setNome] = useState(combo?.nome ?? "");
  const [descricao, setDescricao] = useState(combo?.descricao ?? "");
  const [tipo, setTipo] = useState<TipoCombo>(
    combo?.tipo ?? "desconto_multi_sala",
  );
  const [salasSel, setSalasSel] = useState<
    { salaId: string; aplicaDesconto: boolean }[]
  >(combo?.salas ?? []);
  const [tipoDesconto, setTipoDesconto] = useState<TipoDesconto>(
    combo?.tipoDesconto ?? "percentual",
  );
  const [descontoValor, setDescontoValor] = useState(
    combo?.descontoValor != null
      ? combo.tipoDesconto === "percentual"
        ? String(combo.descontoValor)
        : centavosParaTexto(combo.descontoValor)
      : "",
  );
  const [salaAssinatura, setSalaAssinatura] = useState(
    combo?.tipo === "assinatura_mensal" ? (combo.salas[0]?.salaId ?? "") : "",
  );
  const [valorFechado, setValorFechado] = useState(
    combo?.valorCentavos != null ? centavosParaTexto(combo.valorCentavos) : "",
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function toggleSala(id: string) {
    setSalasSel((prev) =>
      prev.some((s) => s.salaId === id)
        ? prev.filter((s) => s.salaId !== id)
        : [...prev, { salaId: id, aplicaDesconto: false }],
    );
  }
  function toggleAplica(id: string) {
    setSalasSel((prev) =>
      prev.map((s) =>
        s.salaId === id ? { ...s, aplicaDesconto: !s.aplicaDesconto } : s,
      ),
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);

    const input: ComboInput = {
      nome: nome.trim(),
      descricao: descricao.trim(),
      tipo,
      tipoDesconto: tipo === "desconto_multi_sala" ? tipoDesconto : null,
      descontoValor:
        tipo === "desconto_multi_sala"
          ? tipoDesconto === "percentual"
            ? Number.parseInt(descontoValor, 10) || 0
            : brlParaCentavos(descontoValor)
          : null,
      valorCentavos:
        tipo === "assinatura_mensal" || tipo === "evento_privativo"
          ? brlParaCentavos(valorFechado)
          : null,
      salas:
        tipo === "desconto_multi_sala"
          ? salasSel
          : tipo === "assinatura_mensal"
            ? salaAssinatura
              ? [{ salaId: salaAssinatura, aplicaDesconto: false }]
              : []
            : [],
    };

    const r =
      modo === "criar"
        ? await criarCombo(input)
        : await atualizarCombo(combo?.id ?? "", input);
    if (r.error) {
      setErro(r.error);
      setSalvando(false);
      return;
    }
    toast.success(modo === "criar" ? "Combo criado." : "Combo salvo.");
    router.push("/admin/salas");
  }

  const tipoInfo = TIPOS_COMBO.find((t) => t.valor === tipo);

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nome">Nome do combo</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="descricao">Descrição</Label>
            <textarea
              id="descricao"
              rows={2}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              className="min-h-16 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="tipo">Tipo</Label>
            <select
              id="tipo"
              className={inputClasses}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoCombo)}
            >
              {TIPOS_COMBO.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.rotulo}
                </option>
              ))}
            </select>
            {tipoInfo ? (
              <p className="text-xs text-ink-muted">{tipoInfo.descricao}</p>
            ) : null}
          </div>

          {tipo === "desconto_multi_sala" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label>Salas do combo</Label>
                <p className="text-xs text-ink-muted">
                  Marque as salas que compõem o combo e em qual(is) o desconto
                  incide.
                </p>
                <div className="rounded-lg border divide-y">
                  {salasDisponiveis.map((s) => {
                    const sel = salasSel.find((x) => x.salaId === s.id);
                    return (
                      <div
                        key={s.id}
                        className="flex items-center justify-between gap-2 px-3 py-2"
                      >
                        <label className="flex items-center gap-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            className="size-4"
                            checked={!!sel}
                            onChange={() => toggleSala(s.id)}
                          />
                          {s.nome}
                        </label>
                        {sel ? (
                          <label className="flex items-center gap-1.5 text-xs text-ink-muted">
                            <input
                              type="checkbox"
                              className="size-3.5"
                              checked={sel.aplicaDesconto}
                              onChange={() => toggleAplica(s.id)}
                            />
                            desconto aqui
                          </label>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="td">Tipo de desconto</Label>
                  <select
                    id="td"
                    className={inputClasses}
                    value={tipoDesconto}
                    onChange={(e) =>
                      setTipoDesconto(e.target.value as TipoDesconto)
                    }
                  >
                    <option value="percentual">Percentual (%)</option>
                    <option value="valor">Valor (R$)</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="dv">
                    {tipoDesconto === "percentual" ? "Desconto (%)" : "Desconto (R$)"}
                  </Label>
                  <Input
                    id="dv"
                    inputMode="decimal"
                    value={descontoValor}
                    onChange={(e) => setDescontoValor(e.target.value)}
                    placeholder={tipoDesconto === "percentual" ? "40" : "0,00"}
                  />
                </div>
              </div>
            </>
          ) : null}

          {tipo === "assinatura_mensal" ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="sa">Sala</Label>
                <select
                  id="sa"
                  className={inputClasses}
                  value={salaAssinatura}
                  onChange={(e) => setSalaAssinatura(e.target.value)}
                >
                  <option value="">Selecione…</option>
                  {salasDisponiveis.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vm">Valor mensal (R$)</Label>
                <Input
                  id="vm"
                  inputMode="decimal"
                  value={valorFechado}
                  onChange={(e) => setValorFechado(e.target.value)}
                  placeholder="0,00"
                />
              </div>
            </div>
          ) : null}

          {tipo === "evento_privativo" ? (
            <div className="flex flex-col gap-1.5">
              <p className="rounded-md bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                Inclui todas as salas da ACIMM.
              </p>
              <Label htmlFor="ve">Valor do evento (R$)</Label>
              <Input
                id="ve"
                inputMode="decimal"
                value={valorFechado}
                onChange={(e) => setValorFechado(e.target.value)}
                placeholder="0,00"
                className="max-w-xs"
              />
            </div>
          ) : null}

          {erro ? (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          ) : null}

          <div>
            <Button type="submit" disabled={salvando}>
              {salvando
                ? "Salvando…"
                : modo === "criar"
                  ? "Criar combo"
                  : "Salvar combo"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
