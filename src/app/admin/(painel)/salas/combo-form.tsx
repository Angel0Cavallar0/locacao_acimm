"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  PERIODOS,
  type PeriodoDia,
  TIPOS_COMBO,
  type TipoCombo,
  type TipoDesconto,
} from "@/lib/dominio";
import { brlParaCentavos, centavosParaBRL } from "@/lib/utils/moeda";
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
  diasNoMes: number | null;
  periodo: PeriodoDia | null;
  salas: { salaId: string; aplicaDesconto: boolean }[];
  coffeeNivelId: string | null;
  coffeeQualquer: boolean;
}

/** Preço de referência (associado, vigente) por sala e por período, em centavos. */
export type PrecosPorSala = Record<string, Record<string, number>>;

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function centavosParaTexto(c: number) {
  return (c / 100).toFixed(2).replace(".", ",");
}

export function ComboForm({
  modo,
  salasDisponiveis,
  precosPorSala,
  coffeeNiveis,
  combo,
}: {
  modo: "criar" | "editar";
  salasDisponiveis: { id: string; nome: string }[];
  precosPorSala: PrecosPorSala;
  coffeeNiveis: { id: string; nome: string }[];
  combo?: ComboDados;
}) {
  const router = useRouter();
  const [nome, setNome] = useState(combo?.nome ?? "");
  const [descricao, setDescricao] = useState(combo?.descricao ?? "");
  const [tipo, setTipo] = useState<TipoCombo>(
    combo?.tipo ?? "desconto_multi_sala",
  );
  const [salasSel, setSalasSel] = useState<string[]>(
    combo?.salas.map((s) => s.salaId) ?? [],
  );
  const [salaDesconto, setSalaDesconto] = useState(
    combo?.salas.find((s) => s.aplicaDesconto)?.salaId ?? "",
  );
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
  const [diasNoMes, setDiasNoMes] = useState(
    combo?.diasNoMes != null ? String(combo.diasNoMes) : "",
  );
  const [periodo, setPeriodo] = useState<string>(combo?.periodo ?? "");
  const [valorFechado, setValorFechado] = useState(
    combo?.valorCentavos != null ? centavosParaTexto(combo.valorCentavos) : "",
  );
  const [coffeeNivelId, setCoffeeNivelId] = useState(combo?.coffeeNivelId ?? "");
  const [coffeeQualquer, setCoffeeQualquer] = useState(
    combo?.coffeeQualquer ?? false,
  );
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function toggleSala(id: string) {
    setSalasSel((prev) => {
      const tem = prev.includes(id);
      if (tem && salaDesconto === id) setSalaDesconto("");
      return tem ? prev.filter((x) => x !== id) : [...prev, id];
    });
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
      diasNoMes:
        tipo === "assinatura_mensal"
          ? Number.parseInt(diasNoMes, 10) || null
          : null,
      periodo:
        (tipo === "assinatura_mensal" || tipo === "evento_privativo") && periodo
          ? (periodo as PeriodoDia)
          : null,
      salas:
        tipo === "desconto_multi_sala"
          ? salasSel.map((id) => ({
              salaId: id,
              aplicaDesconto: id === salaDesconto,
            }))
          : tipo === "assinatura_mensal"
            ? salaAssinatura
              ? [{ salaId: salaAssinatura, aplicaDesconto: false }]
              : []
            : [],
      coffeeNivelId:
        tipo === "desconto_multi_sala" && coffeeNivelId ? coffeeNivelId : null,
      coffeeQualquer:
        tipo === "desconto_multi_sala" && !coffeeNivelId && coffeeQualquer,
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

  // Comparativo da assinatura, usando o preço do período escolhido.
  const diariaRef =
    salaAssinatura && periodo
      ? (precosPorSala[salaAssinatura]?.[periodo] ?? null)
      : null;
  const dias = Number.parseInt(diasNoMes, 10) || 0;
  const semCombo = diariaRef != null && dias > 0 ? diariaRef * dias : null;
  const comCombo = brlParaCentavos(valorFechado);
  const economia = semCombo != null ? semCombo - comCombo : null;

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
                  Marque as salas que compõem o combo.
                </p>
                <div className="divide-y rounded-lg border">
                  {salasDisponiveis.map((s) => (
                    <label
                      key={s.id}
                      className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-ink"
                    >
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={salasSel.includes(s.id)}
                        onChange={() => toggleSala(s.id)}
                      />
                      {s.nome}
                    </label>
                  ))}
                </div>
              </div>

              {salasSel.length > 0 ? (
                <div className="flex flex-col gap-1.5">
                  <Label>Sala que recebe o desconto</Label>
                  <div className="divide-y rounded-lg border">
                    {salasDisponiveis
                      .filter((s) => salasSel.includes(s.id))
                      .map((s) => (
                        <label
                          key={s.id}
                          className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm text-ink"
                        >
                          <input
                            type="radio"
                            name="sala-desconto"
                            className="size-4"
                            checked={salaDesconto === s.id}
                            onChange={() => setSalaDesconto(s.id)}
                          />
                          {s.nome}
                        </label>
                      ))}
                  </div>
                </div>
              ) : null}

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
                    {tipoDesconto === "percentual"
                      ? "Desconto (%)"
                      : "Desconto (R$)"}
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

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cf">Coffee break obrigatório (opcional)</Label>
                <select
                  id="cf"
                  className={inputClasses}
                  value={coffeeQualquer ? "__qualquer__" : coffeeNivelId}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "__qualquer__") {
                      setCoffeeQualquer(true);
                      setCoffeeNivelId("");
                    } else {
                      setCoffeeQualquer(false);
                      setCoffeeNivelId(v);
                    }
                  }}
                >
                  <option value="">Nenhum</option>
                  <option value="__qualquer__">
                    Qualquer coffee break (obrigatório escolher um)
                  </option>
                  {coffeeNiveis.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.nome}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-ink-muted">
                  "Qualquer" exige que a reserva inclua algum coffee (o associado
                  escolhe o nível). Um nível específico exige exatamente esse
                  coffee. O desconto só se aplica quando a condição é atendida.
                </p>
              </div>
            </>
          ) : null}

          {tipo === "assinatura_mensal" ? (
            <>
              <div className="grid grid-cols-3 gap-3">
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
                  <Label htmlFor="per">Período</Label>
                  <select
                    id="per"
                    className={inputClasses}
                    value={periodo}
                    onChange={(e) => setPeriodo(e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {PERIODOS.map((p) => (
                      <option key={p.valor} value={p.valor}>
                        {p.rotulo}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="dm">Dias no mês</Label>
                  <Input
                    id="dm"
                    type="number"
                    min={1}
                    max={31}
                    value={diasNoMes}
                    onChange={(e) => setDiasNoMes(e.target.value)}
                    placeholder="Ex.: 4"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="vm">Valor mensal com o combo (R$)</Label>
                <Input
                  id="vm"
                  inputMode="decimal"
                  value={valorFechado}
                  onChange={(e) => setValorFechado(e.target.value)}
                  placeholder="0,00"
                  className="max-w-xs"
                />
              </div>

              <div className="rounded-md border bg-surface-muted p-3 text-sm">
                {diariaRef == null ? (
                  <p className="text-ink-muted">
                    Selecione a sala e o período (com preço associado vigente)
                    para estimar o valor sem o combo.
                  </p>
                ) : (
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between">
                      <span className="text-ink-muted">
                        Sem o combo ({dias || 0} × {centavosParaBRL(diariaRef)})
                      </span>
                      <span className="text-ink">
                        {semCombo != null ? centavosParaBRL(semCombo) : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">Com o combo</span>
                      <span className="font-medium text-ink">
                        {centavosParaBRL(comCombo)}
                      </span>
                    </div>
                    {economia != null && economia > 0 ? (
                      <div className="flex justify-between border-t pt-1 text-brand">
                        <span>Economia</span>
                        <span className="font-medium">
                          {centavosParaBRL(economia)}
                        </span>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </>
          ) : null}

          {tipo === "evento_privativo" ? (
            <>
              <p className="rounded-md bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                Inclui todas as salas da ACIMM.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="pe">Horário (período)</Label>
                  <select
                    id="pe"
                    className={inputClasses}
                    value={periodo}
                    onChange={(e) => setPeriodo(e.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {PERIODOS.map((p) => (
                      <option key={p.valor} value={p.valor}>
                        {p.rotulo}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="ve">Valor do evento (R$)</Label>
                  <Input
                    id="ve"
                    inputMode="decimal"
                    value={valorFechado}
                    onChange={(e) => setValorFechado(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
              </div>
            </>
          ) : null}

          {erro ? (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          ) : null}

          <div>
            <Button type="submit" loading={salvando}>
              {modo === "criar" ? "Criar combo" : "Salvar combo"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
