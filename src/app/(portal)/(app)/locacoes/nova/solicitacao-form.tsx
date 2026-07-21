"use client";

import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarSearch,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChipAcaoDialog } from "@/components/disponibilidade/chip-acao-dialog";
import { ChipPeriodoButton } from "@/components/disponibilidade/chip-periodo";
import {
  CamposDinamicos,
  type CampoDinamico,
} from "@/components/locacoes/campos-dinamicos";
import {
  type RespostaValor,
  respostaVazia,
} from "@/lib/formulario/campos-core";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { listarDisponibilidadeAction } from "@/app/(portal)/(app)/disponibilidade/actions";
import { faixaDe, rotuloFaixa, valorPessoaDe } from "@/lib/coffee/faixas-core";
import type { AdicionalCoffee, FaixaPreco } from "@/lib/coffee/tipos";
import { agregarChips } from "@/lib/disponibilidade/agregado-core";
import { PERIODOS, type PeriodoDia } from "@/lib/dominio";
import type {
  ChipPeriodo,
  ContatoAcimm,
  DisponibilidadeDia,
  SalaDisponibilidade,
} from "@/lib/disponibilidade/tipos";
import type { ComboAplicavel } from "@/lib/locacoes/combos-dados";
import { descreverCombo } from "@/lib/locacoes/combo-descricao";
import { somarDias } from "@/lib/disponibilidade/janela";
import { FORMAS_PAGAMENTO } from "@/lib/locacoes/tipos";
import { cn } from "@/lib/utils";
import { apenasDigitos, documentoValido } from "@/lib/utils/documento";
import { mascararDocumento, mascararTelefone } from "@/lib/utils/mascaras";
import { centavosParaBRL } from "@/lib/utils/moeda";
import {
  criarSolicitacao,
  previewValores,
  type ResumoSolicitacao,
  sugerirDatas,
} from "./actions";

interface SalaOpcao {
  id: string;
  nome: string;
  capacidade: number;
}

interface AssociadoView {
  nome: string;
  documento: string;
  emails: string[];
  telefone: string;
}

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

// Formas aceitas no portal — "isento" é decisão da ACIMM, não aparece aqui.
const FORMAS_PORTAL = FORMAS_PAGAMENTO.filter((f) => f.valor !== "isento");

const ETAPAS = [
  "Sala e data",
  "Seus dados",
  "Sobre o evento",
  "Coffee break",
  "Pagamento",
] as const;

function digitos(v: string): number {
  return v.replace(/\D/g, "").length;
}

/** '01/MM/yyyy' do mês seguinte ao ciclo 'YYYY-MM-01' (renovação do benefício). */
function renovaEmCiclo(ciclo: string): string {
  const [y, m] = ciclo.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `01/${String(nm).padStart(2, "0")}/${ny}`;
}

function emailValido(v: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());
}

/** "4h" / "4h30" / "90 min" para a nota de hora adicional. */
function formatarDuracao(minutos: number): string {
  if (minutos % 60 === 0) return `${minutos / 60}h`;
  if (minutos > 60) {
    return `${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, "0")}`;
  }
  return `${minutos} min`;
}

export function SolicitacaoForm({
  todasSalas,
  niveis,
  campos,
  associado,
  contato,
  combos,
  prefill,
  hoje,
  dataMax,
}: {
  todasSalas: SalaOpcao[];
  niveis: {
    id: string;
    nome: string;
    faixas: FaixaPreco[];
    adicionais: AdicionalCoffee[];
  }[];
  campos: CampoDinamico[];
  associado: AssociadoView;
  contato: ContatoAcimm;
  combos: ComboAplicavel[];
  prefill: {
    salaId: string | null;
    data: string | null;
    periodo: PeriodoDia | null;
    comboId: string | null;
  };
  hoje: string;
  dataMax: string;
}) {
  const router = useRouter();
  const [etapa, setEtapa] = useState(0);

  // Combo pré-selecionado via ?combo= (vindo da tela de disponibilidade, §B):
  // governa sala(s) e período iniciais.
  const comboPrefill = prefill.comboId
    ? (combos.find((c) => c.id === prefill.comboId) ?? null)
    : null;

  // Etapa 1 — sala e data
  const [salaIds, setSalaIds] = useState<string[]>(
    comboPrefill
      ? comboPrefill.salaIdsObrigatorias
      : prefill.salaId
        ? [prefill.salaId]
        : [],
  );
  const [data, setData] = useState(prefill.data ?? hoje);
  const [periodo, setPeriodo] = useState<PeriodoDia>(
    comboPrefill?.periodo ?? prefill.periodo ?? "manha",
  );
  const [comboId, setComboId] = useState<string | null>(
    comboPrefill?.id ?? null,
  );
  const [disp, setDisp] = useState<DisponibilidadeDia | null>(null);
  const [carregandoDisp, setCarregandoDisp] = useState(false);
  const [sel, setSel] = useState<{ sala: SalaDisponibilidade; chip: ChipPeriodo } | null>(
    null,
  );
  const [sugestoes, setSugestoes] = useState<string[] | null>(null);
  const [buscandoSugestoes, setBuscandoSugestoes] = useState(false);

  // Etapa 2 — dados
  const [emailContato, setEmailContato] = useState(associado.emails[0] ?? "");
  const [telefoneContato, setTelefoneContato] = useState(
    mascararTelefone(associado.telefone),
  );
  const [responsavelNome, setResponsavelNome] = useState("");
  const [terceiro, setTerceiro] = useState(false);
  const [terceiroNome, setTerceiroNome] = useState("");
  const [terceiroDocumento, setTerceiroDocumento] = useState("");
  const [terceiroEmail, setTerceiroEmail] = useState("");
  const [terceiroTelefone, setTerceiroTelefone] = useState("");

  // Etapa 3 — evento
  const [qtdPessoas, setQtdPessoas] = useState("");
  const [tipoEvento, setTipoEvento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [respostas, setRespostas] = useState<Record<string, RespostaValor>>({});

  // Etapa 4 — coffee (combo com coffee obrigatório já inclui — Spec 26)
  const [coffeeIncluir, setCoffeeIncluir] = useState(
    Boolean(comboPrefill?.coffeeNivelId || comboPrefill?.coffeeQualquer),
  );
  const [coffeeNivelId, setCoffeeNivelId] = useState(
    comboPrefill?.coffeeNivelId ?? niveis[0]?.id ?? "",
  );
  const [coffeeQtd, setCoffeeQtd] = useState("");
  const [coffeeHorario, setCoffeeHorario] = useState("");
  const [coffeeObs, setCoffeeObs] = useState("");
  const [coffeeAdicionais, setCoffeeAdicionais] = useState<AdicionalCoffee[]>(
    [],
  );

  // Etapa 5 — pagamento
  const [formaPagamento, setFormaPagamento] = useState("");
  const [resumo, setResumo] = useState<ResumoSolicitacao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const nomeSala = useMemo(
    () => new Map(todasSalas.map((s) => [s.id, s.nome])),
    [todasSalas],
  );

  // Disponibilidade da etapa 1 (view compartilhada — nunca agenda direto).
  const chaveDisp = `${salaIds.join(",")}|${data}`;
  useEffect(() => {
    if (salaIds.length === 0 || !data) {
      setDisp(null);
      return;
    }
    let ativo = true;
    setCarregandoDisp(true);
    const t = setTimeout(() => {
      listarDisponibilidadeAction({ data, salaIds }).then((r) => {
        if (!ativo) return;
        setCarregandoDisp(false);
        if ("error" in r) {
          toast.error(r.error);
          setDisp(null);
          return;
        }
        setDisp(r);
      });
    }, 250);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [chaveDisp]);

  // Trocar salas/data invalida sugestões de datas antigas.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset por chave
  useEffect(() => {
    setSugestoes(null);
  }, [chaveDisp, periodo]);

  const salaChipsSel = useMemo(() => {
    if (!disp) return [];
    return disp.salas.map((s) => ({
      sala: s,
      chip: s.chips.find((c) => c.periodo === periodo),
    }));
  }, [disp, periodo]);

  const agg = useMemo(
    () => agregarChips(salaChipsSel.map((x) => x.chip)),
    [salaChipsSel],
  );
  const todasLivres =
    agg.estado === "livre" && salaChipsSel.length === salaIds.length;
  const bloqueadas = salaChipsSel.filter(
    (x): x is { sala: SalaDisponibilidade; chip: ChipPeriodo } =>
      Boolean(x.chip) && x.chip?.estado !== "livre",
  );

  const capacidadeMenor = useMemo(() => {
    const caps = todasSalas
      .filter((s) => salaIds.includes(s.id))
      .map((s) => s.capacidade);
    return caps.length > 0 ? Math.min(...caps) : 0;
  }, [todasSalas, salaIds]);
  const excedeCapacidade =
    qtdPessoas !== "" &&
    capacidadeMenor > 0 &&
    Number(qtdPessoas) > capacidadeMenor;

  // Coffee: nível e valores para exibição (o servidor recalcula no submit).
  const nivelSel = niveis.find((n) => n.id === coffeeNivelId) ?? null;
  const qtdCoffee = Number(coffeeQtd) || Number(qtdPessoas) || 0;
  const faixaCoffee = nivelSel ? faixaDe(nivelSel.faixas, qtdCoffee) : null;
  const valorPessoaCoffee = nivelSel
    ? valorPessoaDe(nivelSel.faixas, qtdCoffee)
    : 0;
  const coffeeAdicionaisCentavos = coffeeAdicionais.reduce(
    (s, a) => s + a.valorCentavos,
    0,
  );
  const baseCoffee = valorPessoaCoffee * qtdCoffee;
  const totalCoffee = baseCoffee + coffeeAdicionaisCentavos;

  // Período gratuito do sócio: pode recusar (guarda o uso para outra data).
  const [pgRecusado, setPgRecusado] = useState(false);

  // Resumo (etapa 5) — server recalcula, client só exibe.
  const chaveResumo = JSON.stringify({
    salaIds,
    data,
    periodo,
    pgRecusado,
    comboId,
    coffee:
      coffeeIncluir && coffeeNivelId
        ? { coffeeNivelId, coffeeQtd, coffeeAdicionaisCentavos }
        : null,
  });
  useEffect(() => {
    if (etapa !== 4 || salaIds.length === 0) return;
    let ativo = true;
    previewValores({
      salaIds,
      data,
      periodo,
      periodoGratuitoRecusado: pgRecusado,
      comboId,
      coffee:
        coffeeIncluir && coffeeNivelId
          ? {
              nivelId: coffeeNivelId,
              qtdPessoas: qtdCoffee,
              adicionaisCentavos: coffeeAdicionaisCentavos,
            }
          : null,
    }).then((r) => {
      if (ativo) setResumo(r);
    });
    return () => {
      ativo = false;
    };
    // biome-ignore lint/correctness/useExhaustiveDependencies: chaveResumo cobre as deps
  }, [etapa, chaveResumo]);

  function toggleSala(id: string) {
    if (comboId) return; // salas travadas pelo combo
    setSalaIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  const comboSel = combos.find((c) => c.id === comboId) ?? null;
  // Coffee exigido pelo combo (nível fixo OU qualquer) trava o toggle "incluir".
  const coffeeObrigatorioCombo = Boolean(
    comboSel?.coffeeNivelId || comboSel?.coffeeQualquer,
  );
  // O nível só é travado quando o combo fixa um específico.
  const coffeeNivelTravado = comboSel?.coffeeNivelId ?? null;
  function selecionarCombo(c: ComboAplicavel) {
    setComboId(c.id);
    setSalaIds(c.salaIdsObrigatorias);
    if (c.periodo) setPeriodo(c.periodo);
    // Coffee obrigatório do combo (Spec 26): nível fixo → inclui e trava; ou
    // "qualquer" → só garante que o coffee esteja incluído.
    if (c.coffeeNivelId) {
      setCoffeeIncluir(true);
      setCoffeeNivelId(c.coffeeNivelId);
    } else if (c.coffeeQualquer) {
      setCoffeeIncluir(true);
    }
  }

  async function verProximasDatas() {
    setBuscandoSugestoes(true);
    const datas = await sugerirDatas({ salaIds, periodo, aPartirDe: data });
    setBuscandoSugestoes(false);
    setSugestoes(datas);
    if (datas.length === 0) {
      toast.info("Sem datas livres próximas para todas as salas escolhidas.");
    }
  }

  const camposObrigatoriosPendentes = campos.some(
    (c) => c.obrigatorio && respostaVazia(c.tipo, respostas[c.id]),
  );

  function podeAvancar(): boolean {
    if (etapa === 0) return todasLivres;
    if (etapa === 1) {
      const respOk = responsavelNome.trim().length > 0;
      if (terceiro) {
        return (
          respOk &&
          terceiroNome.trim().length > 0 &&
          documentoValido(apenasDigitos(terceiroDocumento)) &&
          emailValido(terceiroEmail) &&
          digitos(terceiroTelefone) >= 8
        );
      }
      return respOk && emailValido(emailContato) && digitos(telefoneContato) >= 8;
    }
    if (etapa === 2) {
      return Number(qtdPessoas) > 0 && !camposObrigatoriosPendentes;
    }
    return true;
  }

  // Coffee não existe → pula a etapa 4.
  const temCoffee = niveis.length > 0;
  function proximaEtapa(atual: number): number {
    const n = atual + 1;
    if (n === 3 && !temCoffee) return 4;
    return n;
  }
  function etapaAnterior(atual: number): number {
    const p = atual - 1;
    if (p === 3 && !temCoffee) return 2;
    return p;
  }

  async function enviar() {
    setErro(null);
    setEnviando(true);
    const r = await criarSolicitacao({
      salaIds,
      data,
      periodo,
      terceiro,
      emailContato: emailContato.trim(),
      telefoneContato: telefoneContato.trim(),
      responsavelNome: responsavelNome.trim(),
      terceiroNome: terceiroNome.trim(),
      terceiroDocumento,
      terceiroEmail: terceiroEmail.trim(),
      terceiroTelefone: terceiroTelefone.trim(),
      qtdPessoas: Number(qtdPessoas) || 0,
      tipoEvento: tipoEvento.trim(),
      observacoes: observacoes.trim(),
      respostasFormulario: respostas,
      coffee:
        coffeeIncluir && coffeeNivelId
          ? {
              nivelId: coffeeNivelId,
              qtdPessoas: qtdCoffee,
              horarioServir: coffeeHorario || null,
              adicionais: coffeeAdicionais,
              observacoes: coffeeObs.trim(),
            }
          : null,
      formaPagamento:
        (formaPagamento as
          | "pix"
          | "transferencia"
          | "boleto_avulso"
          | "boleto_mensalidade") || null,
      periodoGratuitoRecusado: pgRecusado,
      comboId,
    });
    setEnviando(false);
    if (r.error) {
      setErro(r.error);
      return;
    }
    toast.success("Solicitação enviada.");
    router.push(`/locacoes/${r.id}`);
  }

  const noPassado = data <= hoje;
  const noFuturo = data >= dataMax;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div>
        <h2 className="font-display text-lg font-semibold text-ink">
          Solicitar locação
        </h2>
        <p className="text-sm text-ink-muted">
          Etapa {etapa + 1} de {ETAPAS.length} · {ETAPAS[etapa]}
        </p>
        <div className="mt-2 flex gap-1">
          {ETAPAS.map((rot, i) => (
            <span
              key={rot}
              className={cn(
                "h-1 flex-1 rounded-full",
                i <= etapa ? "bg-brand" : "bg-surface-muted",
              )}
            />
          ))}
        </div>
      </div>

      {/* ---------- Etapa 1 — Sala e data ---------- */}
      {etapa === 0 ? (
        <Card>
          <CardContent className="flex flex-col gap-4">
            {combos.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <Label>Combos (opcional)</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {combos.map((c) => {
                    const sel = comboId === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => (sel ? setComboId(null) : selecionarCombo(c))}
                        className={cn(
                          "flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors",
                          sel ? "border-brand bg-brand/10" : "hover:bg-surface-muted",
                        )}
                      >
                        <span className="text-sm font-medium text-ink">{c.nome}</span>
                        <span className="text-xs text-ink-muted">
                          {descreverCombo(c)}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {comboSel ? (
                  <p className="text-xs text-ink-muted">
                    Combo aplicado — salas e período travados.{" "}
                    <button
                      type="button"
                      onClick={() => setComboId(null)}
                      className="font-medium text-brand hover:underline"
                    >
                      Remover combo
                    </button>
                  </p>
                ) : null}
              </div>
            ) : null}

            <div className="flex flex-col gap-1.5">
              <Label>Salas</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {todasSalas.map((s) => {
                  const ativoSel = salaIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={comboId !== null}
                      onClick={() => toggleSala(s.id)}
                      className={cn(
                        "flex flex-col items-start rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50",
                        ativoSel
                          ? "border-brand bg-brand/5"
                          : "hover:bg-surface-muted",
                      )}
                    >
                      <span className="text-sm font-medium text-ink">
                        {s.nome}
                      </span>
                      <span className="text-xs text-ink-muted">
                        {s.capacidade} lugares
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label>Data</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Dia anterior"
                  disabled={noPassado}
                  onClick={() => setData((d) => somarDias(d, -1))}
                >
                  <ChevronLeft className="size-4" />
                </Button>
                <div className="flex-1">
                  <DatePicker
                    value={data}
                    onChange={setData}
                    dataMin={hoje}
                    dataMax={dataMax}
                  />
                </div>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Próximo dia"
                  disabled={noFuturo}
                  onClick={() => setData((d) => somarDias(d, 1))}
                >
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>

            {salaIds.length === 0 ? (
              <p className="text-sm text-ink-muted">
                Selecione ao menos uma sala para ver os horários.
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Label>Período</Label>
                  {carregandoDisp ? (
                    <span className="flex items-center gap-1 text-xs text-ink-muted">
                      <span className="size-3 animate-spin rounded-full border border-ink-muted border-t-transparent" />
                      Carregando…
                    </span>
                  ) : null}
                </div>
                <div
                  className={cn(
                    "grid grid-cols-2 gap-1.5 sm:grid-cols-4",
                    carregandoDisp && "opacity-60",
                  )}
                >
                  {PERIODOS.map((p) => {
                    const chips = disp
                      ? disp.salas.map((s) =>
                          s.chips.find((c) => c.periodo === p.valor),
                        )
                      : [];
                    const a = disp ? agregarChips(chips) : null;
                    const faixa =
                      chips.find(Boolean)?.faixa ?? { inicio: "", fim: "" };
                    const eventoTitulo =
                      chips.find((c) => c?.eventoTitulo)?.eventoTitulo ?? null;
                    const eventoSymplaUrl =
                      chips.find((c) => c?.eventoSymplaUrl)?.eventoSymplaUrl ??
                      null;
                    const chipView: ChipPeriodo = {
                      periodo: p.valor,
                      rotulo: p.rotulo,
                      faixa,
                      estado: a?.estado ?? "sem_preco",
                      precoCentavos: a?.precoTotal ?? null,
                      eventoTitulo,
                      eventoSymplaId: null,
                      eventoSymplaUrl,
                      // Benefício exige sala única — não vale no chip agregado.
                      gratuitoDisponivel: false,
                    };
                    return (
                      <ChipPeriodoButton
                        key={p.valor}
                        chip={chipView}
                        podeSolicitar={disp?.podeSolicitar ?? false}
                        selecionado={periodo === p.valor}
                        onClick={() => {
                          if (comboSel?.periodo == null) setPeriodo(p.valor);
                        }}
                      />
                    );
                  })}
                </div>

                {disp && !carregandoDisp ? (
                  todasLivres ? (
                    <div className="flex items-center justify-between rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
                      <span className="flex items-center gap-1.5 text-ink">
                        <CheckCircle2 className="size-4 text-emerald-600" />
                        Disponível neste período
                      </span>
                      {agg.precoTotal !== null ? (
                        <span className="font-medium text-ink">
                          {centavosParaBRL(agg.precoTotal)}
                        </span>
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                      <p className="text-ink">
                        {agg.estado === "evento_acimm"
                          ? "Uma das salas tem um evento da ACIMM neste período."
                          : agg.estado === "solicitado"
                            ? "Este período já foi solicitado por outro associado e aguarda aprovação."
                            : "Este período está indisponível para uma das salas."}
                      </p>
                      <div className="flex flex-col gap-1.5">
                        {bloqueadas.map(({ sala, chip }) => (
                          <button
                            key={sala.id}
                            type="button"
                            onClick={() => setSel({ sala, chip })}
                            className="flex items-center justify-between rounded-md border bg-surface px-2.5 py-1.5 text-left text-xs hover:bg-surface-muted"
                          >
                            <span className="text-ink">{sala.nome}</span>
                            <span className="font-medium text-brand">
                              {chip.estado === "evento_acimm"
                                ? "Ver convite"
                                : "Fila de espera"}
                            </span>
                          </button>
                        ))}
                      </div>
                      {agg.estado === "ocupado" || agg.estado === "solicitado" ? (
                        <div className="flex flex-col gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            loading={buscandoSugestoes}
                            onClick={verProximasDatas}
                          >
                            <CalendarSearch className="size-4" />
                            Ver próximas datas livres
                          </Button>
                          {sugestoes && sugestoes.length > 0 ? (
                            <div className="flex flex-wrap gap-1.5">
                              {sugestoes.map((d) => (
                                <button
                                  key={d}
                                  type="button"
                                  onClick={() => {
                                    setData(d);
                                    setSugestoes(null);
                                  }}
                                  className="rounded-full border border-brand/40 bg-brand/5 px-2.5 py-1 text-xs text-brand hover:bg-brand/10"
                                >
                                  {new Date(`${d}T12:00:00`).toLocaleDateString(
                                    "pt-BR",
                                    { day: "2-digit", month: "short" },
                                  )}
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )
                ) : null}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {/* ---------- Etapa 2 — Seus dados ---------- */}
      {etapa === 1 ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label>Nome / Razão social</Label>
                <Input value={associado.nome} readOnly disabled />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>CNPJ / CPF</Label>
                <Input
                  value={mascararDocumento(associado.documento)}
                  readOnly
                  disabled
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email-contato">E-mail</Label>
                {associado.emails.length > 1 ? (
                  <select
                    id="email-contato"
                    className={inputClasses}
                    value={emailContato}
                    onChange={(e) => setEmailContato(e.target.value)}
                  >
                    {associado.emails.map((em) => (
                      <option key={em} value={em}>
                        {em}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    id="email-contato"
                    value={emailContato}
                    onChange={(e) => setEmailContato(e.target.value)}
                  />
                )}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tel-contato">Telefone</Label>
                <Input
                  id="tel-contato"
                  value={telefoneContato}
                  onChange={(e) =>
                    setTelefoneContato(mascararTelefone(e.target.value))
                  }
                  inputMode="tel"
                  placeholder="(00) 00000-0000"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="responsavel">Responsável pela locação *</Label>
              <Input
                id="responsavel"
                value={responsavelNome}
                onChange={(e) => setResponsavelNome(e.target.value)}
                placeholder="Quem assina e responde pela reserva"
              />
            </div>

            <p className="text-xs text-ink-muted">
              Dados cadastrais desatualizados? Fale com a ACIMM.
            </p>

            <label className="flex cursor-pointer items-center gap-2 border-t pt-3">
              <input
                type="checkbox"
                className="size-4"
                checked={terceiro}
                onChange={(e) => setTerceiro(e.target.checked)}
              />
              <span className="text-sm font-medium text-ink">
                Locação em nome de terceiro
              </span>
            </label>

            {terceiro ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="t-nome">Nome do locatário</Label>
                  <Input
                    id="t-nome"
                    value={terceiroNome}
                    onChange={(e) => setTerceiroNome(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="t-doc">CNPJ / CPF</Label>
                  <Input
                    id="t-doc"
                    value={terceiroDocumento}
                    onChange={(e) =>
                      setTerceiroDocumento(mascararDocumento(e.target.value))
                    }
                    inputMode="numeric"
                    placeholder="00.000.000/0000-00"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="t-email">E-mail</Label>
                  <Input
                    id="t-email"
                    type="email"
                    value={terceiroEmail}
                    onChange={(e) => setTerceiroEmail(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="t-tel">Telefone</Label>
                  <Input
                    id="t-tel"
                    value={terceiroTelefone}
                    onChange={(e) =>
                      setTerceiroTelefone(mascararTelefone(e.target.value))
                    }
                    inputMode="tel"
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ---------- Etapa 3 — Sobre o evento ---------- */}
      {etapa === 2 ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="qtd">Nº de pessoas</Label>
                <Input
                  id="qtd"
                  type="number"
                  min={1}
                  value={qtdPessoas}
                  onChange={(e) => setQtdPessoas(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tipo">Tipo de evento</Label>
                <Input
                  id="tipo"
                  value={tipoEvento}
                  onChange={(e) => setTipoEvento(e.target.value)}
                  placeholder="Reunião, curso, palestra…"
                />
              </div>
            </div>
            {excedeCapacidade ? (
              <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                {qtdPessoas} pessoas excede a capacidade da menor sala escolhida (
                {capacidadeMenor}). Você pode seguir; a ACIMM avalia.
              </p>
            ) : null}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="obs">Observações</Label>
              <textarea
                id="obs"
                rows={3}
                value={observacoes}
                onChange={(e) => setObservacoes(e.target.value)}
                className="min-h-20 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder="Necessidades especiais de horário ou de sala? Descreva aqui — a ACIMM ajusta."
              />
            </div>
            <CamposDinamicos
              campos={campos}
              valores={respostas}
              onChange={(id, valor) =>
                setRespostas((r) => ({ ...r, [id]: valor }))
              }
            />
          </CardContent>
        </Card>
      ) : null}

      {/* ---------- Etapa 4 — Coffee break ---------- */}
      {etapa === 3 && temCoffee ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                className="size-4"
                checked={coffeeIncluir}
                disabled={coffeeObrigatorioCombo}
                onChange={(e) => setCoffeeIncluir(e.target.checked)}
              />
              <span className="text-sm font-semibold text-ink">
                Incluir coffee break
              </span>
            </label>
            {coffeeNivelTravado ? (
              <p className="text-xs text-brand">
                Este combo inclui o coffee break{" "}
                {comboSel?.coffeeNivelNome ?? ""} — nível fixado.
              </p>
            ) : coffeeObrigatorioCombo ? (
              <p className="text-xs text-brand">
                Este combo exige um coffee break — escolha um nível.
              </p>
            ) : null}
            {coffeeIncluir ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cn">Nível</Label>
                    <select
                      id="cn"
                      className={inputClasses}
                      value={coffeeNivelId}
                      disabled={coffeeNivelTravado !== null}
                      onChange={(e) => {
                        setCoffeeNivelId(e.target.value);
                        setCoffeeAdicionais([]);
                      }}
                    >
                      {niveis.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.nome}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cq">Pessoas</Label>
                    <Input
                      id="cq"
                      type="number"
                      min={1}
                      value={coffeeQtd}
                      onChange={(e) => setCoffeeQtd(e.target.value)}
                      placeholder={qtdPessoas || "—"}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="ch">Servir às</Label>
                    <Input
                      id="ch"
                      type="time"
                      value={coffeeHorario}
                      onChange={(e) => setCoffeeHorario(e.target.value)}
                    />
                  </div>
                </div>
                {nivelSel && nivelSel.adicionais.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-ink-muted">
                      Adicionais do coffee (clique para incluir)
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {nivelSel.adicionais.map((a) => (
                        <button
                          key={`${a.descricao}-${a.valorCentavos}`}
                          type="button"
                          onClick={() => setCoffeeAdicionais((p) => [...p, a])}
                          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-ink-muted hover:border-brand hover:text-brand"
                        >
                          <Plus className="size-3" />
                          {a.descricao} · {centavosParaBRL(a.valorCentavos)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}

                {coffeeAdicionais.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    {coffeeAdicionais.map((a, i) => (
                      <div
                        // biome-ignore lint/suspicious/noArrayIndexKey: linhas efêmeras
                        key={i}
                        className="flex items-center justify-between rounded-md border px-2.5 py-1 text-xs"
                      >
                        <span className="text-ink">{a.descricao}</span>
                        <span className="flex items-center gap-2">
                          <span className="text-ink-muted">
                            {centavosParaBRL(a.valorCentavos)}
                          </span>
                          <button
                            type="button"
                            aria-label="Remover adicional"
                            onClick={() =>
                              setCoffeeAdicionais((p) =>
                                p.filter((_, j) => j !== i),
                              )
                            }
                            className="text-ink-muted hover:text-destructive"
                          >
                            <X className="size-3.5" />
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : null}

                {qtdCoffee > 0 ? (
                  <div className="rounded-md bg-surface-muted px-3 py-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-ink-muted">
                        Valor por pessoa
                        {faixaCoffee
                          ? ` (faixa ${rotuloFaixa(faixaCoffee)})`
                          : ""}
                      </span>
                      <span className="text-ink">
                        {centavosParaBRL(valorPessoaCoffee)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-ink-muted">{qtdCoffee} pessoas</span>
                      <span className="text-ink">
                        {centavosParaBRL(baseCoffee)}
                      </span>
                    </div>
                    {coffeeAdicionaisCentavos > 0 ? (
                      <div className="flex justify-between">
                        <span className="text-ink-muted">Adicionais</span>
                        <span className="text-ink">
                          {centavosParaBRL(coffeeAdicionaisCentavos)}
                        </span>
                      </div>
                    ) : null}
                    <div className="mt-0.5 flex justify-between border-t pt-1 font-medium">
                      <span className="text-ink">Subtotal do coffee</span>
                      <span className="text-ink">
                        {centavosParaBRL(totalCoffee)}
                      </span>
                    </div>
                  </div>
                ) : null}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="co">Observações do coffee</Label>
                  <Input
                    id="co"
                    value={coffeeObs}
                    onChange={(e) => setCoffeeObs(e.target.value)}
                    placeholder="Restrições alimentares, preferências…"
                  />
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ---------- Etapa 5 — Pagamento e revisão ---------- */}
      {etapa === 4 ? (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5 sm:max-w-xs">
              <Label htmlFor="forma">Forma de pagamento preferida</Label>
              <select
                id="forma"
                className={inputClasses}
                value={formaPagamento}
                onChange={(e) => setFormaPagamento(e.target.value)}
              >
                <option value="">Selecione…</option>
                {FORMAS_PORTAL.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.rotulo}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-md border bg-surface-muted p-3 text-sm">
              {!resumo || resumo.salas.length === 0 ? (
                <p className="text-ink-muted">Calculando o resumo…</p>
              ) : (
                <div className="flex flex-col gap-1">
                  {resumo.combo?.aplicado ? (
                    <div className="mb-1 flex items-center justify-between rounded-md bg-brand/5 px-2 py-1">
                      <span className="text-xs font-medium text-brand">
                        Combo {resumo.combo.nome}
                      </span>
                      {resumo.combo.referenciaCentavos != null ? (
                        <span className="text-xs text-ink-muted">
                          de{" "}
                          <span className="line-through">
                            {centavosParaBRL(resumo.combo.referenciaCentavos)}
                          </span>{" "}
                          por {centavosParaBRL(resumo.salasCentavos)}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                  {resumo.salas.map((s) => (
                    <div key={s.salaId} className="flex justify-between">
                      <span className="text-ink-muted">
                        {nomeSala.get(s.salaId) ?? s.nome}
                      </span>
                      <span
                        className={s.semPreco ? "text-destructive" : "text-ink"}
                      >
                        {s.semPreco
                          ? "sem preço"
                          : centavosParaBRL(s.valorCentavos)}
                      </span>
                    </div>
                  ))}
                  {resumo.coffeeCentavos > 0 ? (
                    <div className="flex justify-between">
                      <span className="text-ink-muted">Coffee break</span>
                      <span className="text-ink">
                        {centavosParaBRL(resumo.coffeeCentavos)}
                      </span>
                    </div>
                  ) : null}
                  {resumo.descontos.map((d) => (
                    <div key={d.rotulo} className="flex justify-between">
                      <span className="text-emerald-700 dark:text-emerald-400">
                        {d.rotulo}
                      </span>
                      <span className="text-emerald-700 dark:text-emerald-400">
                        − {centavosParaBRL(d.valorCentavos)}
                      </span>
                    </div>
                  ))}
                  {resumo.periodoGratuito &&
                  (resumo.periodoGratuito.elegivel ||
                    resumo.periodoGratuito.motivo === "esgotado") ? (
                    <div className="mt-1 rounded-md bg-brand/5 px-2.5 py-2 text-xs">
                      {resumo.periodoGratuito.motivo === "esgotado" ? (
                        <span className="text-ink-muted">
                          Benefício desta sala já utilizado no mês · renova em{" "}
                          {renovaEmCiclo(resumo.periodoGratuito.ciclo)}.
                        </span>
                      ) : (
                        <label className="flex cursor-pointer items-start gap-2">
                          <input
                            type="checkbox"
                            className="mt-0.5 size-3.5"
                            checked={!pgRecusado}
                            onChange={(e) => setPgRecusado(!e.target.checked)}
                          />
                          <span className="text-ink-muted">
                            Usar meu período gratuito (uso{" "}
                            {resumo.periodoGratuito.usoAtual + 1} de{" "}
                            {resumo.periodoGratuito.limite} desta sala no mês).
                            Desmarque para guardar para outra data.
                          </span>
                        </label>
                      )}
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t pt-1 font-semibold">
                    <span className="text-ink">Total</span>
                    <span className="text-ink">
                      {centavosParaBRL(resumo.totalCentavos)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {resumo && resumo.horaAdicional.length > 0 ? (
              <div className="rounded-md border border-input bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                <p className="mb-0.5 font-medium text-ink">Hora adicional</p>
                {resumo.horaAdicional.map((h) => (
                  <p key={h.nome}>
                    {h.nome}: após {formatarDuracao(h.aposMinutos)} de uso, cada
                    hora adicional custa {centavosParaBRL(h.valorHoraCentavos)}.
                  </p>
                ))}
              </div>
            ) : null}

            <div className="rounded-md border border-brand/20 bg-brand/5 px-3 py-2 text-xs text-ink-muted">
              Sua solicitação será analisada pela ACIMM. Você receberá a
              confirmação e o contrato por e-mail e WhatsApp.
            </div>

            {erro ? (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* ---------- Navegação ---------- */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          disabled={etapa === 0 || enviando}
          onClick={() => setEtapa((e) => etapaAnterior(e))}
        >
          <ArrowLeft className="size-4" />
          Voltar
        </Button>
        {etapa < ETAPAS.length - 1 ? (
          <Button
            disabled={!podeAvancar()}
            onClick={() => setEtapa((e) => proximaEtapa(e))}
          >
            Avançar
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button
            loading={enviando}
            disabled={!!resumo?.salasSemPreco.length}
            onClick={enviar}
          >
            Enviar solicitação
          </Button>
        )}
      </div>

      {sel ? (
        <ChipAcaoDialog
          sala={sel.sala}
          chip={sel.chip}
          data={data}
          prefill={{ nome: associado.nome, contato: associado.telefone }}
          contato={contato}
          podeSolicitar={disp?.podeSolicitar ?? false}
          aoFechar={() => setSel(null)}
        />
      ) : null}
    </div>
  );
}
