"use client";

import { AlertTriangle, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  CamposDinamicos,
  type CampoDinamico,
} from "@/components/locacoes/campos-dinamicos";
import type { RespostaValor } from "@/lib/formulario/campos-core";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CONDICOES,
  type CondicaoLocatario,
  PERIODOS,
  type PeriodoDia,
} from "@/lib/dominio";
import type { ComboAplicavel } from "@/lib/locacoes/combos-dados";
import type { HorariosPeriodos } from "@/lib/locacoes/horarios";
import { DatePicker } from "@/components/ui/date-picker";
import { FORMAS_PAGAMENTO } from "@/lib/locacoes/tipos";
import type { FormaPagamento } from "@/lib/locacoes/tipos";
import {
  exigeValorManual,
  servicoDisponivelPara,
  usaQuantidade,
} from "@/lib/servicos-adicionais/core";
import type { ServicoAdicional } from "@/lib/servicos-adicionais/tipos";
import { mascararDocumento, mascararTelefone } from "@/lib/utils/mascaras";
import { brlParaCentavos, centavosParaBRL } from "@/lib/utils/moeda";
import { AssociadoAutocomplete } from "./associado-autocomplete";
import {
  calcularResumoAction,
  consultarDisponibilidadeAction,
  criarLocacaoAssistida,
  ocupacoesDaSalaAction,
} from "./actions";
import type {
  AssociadoBusca,
  ConflitoSobreposicao,
  DisponibilidadeSala,
  ResumoValores,
} from "./tipos";

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/** Descrição curta do combo para o card de seleção. */
function descreverCombo(c: ComboAplicavel): string {
  if (c.tipo === "evento_privativo") {
    return `Privativo — todas as salas por ${centavosParaBRL(c.valorCentavos ?? 0)}`;
  }
  const desc =
    c.tipoDesconto === "percentual"
      ? `${c.descontoValor ?? 0}% de desconto`
      : `${centavosParaBRL(c.descontoValor ?? 0)} de desconto`;
  return `Multi-sala — ${desc}`;
}

/** '01/MM/yyyy' do mês seguinte ao ciclo 'YYYY-MM-01' (renovação do benefício). */
function renovaEm(ciclo: string): string {
  const [y, m] = ciclo.split("-").map(Number);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return `01/${String(nm).padStart(2, "0")}/${ny}`;
}

function mesDeData(iso: string | null): { ano: number; mes: number } {
  if (iso && /^\d{4}-\d{2}/.test(iso)) {
    const [y, m] = iso.split("-").map(Number);
    return { ano: y, mes: m };
  }
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
  const [y, m] = hoje.split("-").map(Number);
  return { ano: y, mes: m };
}

const ESTADO_ROTULO: Record<string, { texto: string; classe: string }> = {
  livre: { texto: "Livre", classe: "text-emerald-700 dark:text-emerald-400" },
  solicitado: {
    texto: "Solicitação pendente neste horário",
    classe: "text-amber-700 dark:text-amber-400",
  },
  ocupado: { texto: "Ocupado", classe: "text-destructive" },
  evento_acimm: { texto: "Evento ACIMM", classe: "text-destructive" },
  bloqueio: { texto: "Bloqueado", classe: "text-destructive" },
};

export function NovaLocacaoForm({
  salas,
  niveis,
  campos,
  horarios,
  prefill,
  combos,
  servicos,
}: {
  salas: { id: string; nome: string; capacidade: number }[];
  niveis: {
    id: string;
    nome: string;
    adicionais: { descricao: string; valorCentavos: number }[];
  }[];
  campos: CampoDinamico[];
  horarios: HorariosPeriodos;
  combos: ComboAplicavel[];
  servicos: ServicoAdicional[];
  prefill: {
    salaId: string | null;
    data: string | null;
    periodo: PeriodoDia | null;
    filaId?: string | null;
    locatario?: {
      condicao: CondicaoLocatario;
      associado: AssociadoBusca | null;
      nome: string;
      documento: string;
      email: string;
      telefone: string;
    } | null;
  };
}) {
  const router = useRouter();

  // Locatário (pré-preenchido quando convertendo da lista de espera).
  const pl = prefill.locatario;
  const [filaId] = useState<string | null>(prefill.filaId ?? null);
  const [condicao, setCondicao] = useState<CondicaoLocatario>(
    pl?.condicao ?? "associado",
  );
  const [assoc, setAssoc] = useState<AssociadoBusca | null>(
    pl?.associado ?? null,
  );
  const [nome, setNome] = useState(pl?.nome ?? "");
  const [documento, setDocumento] = useState(pl?.documento ?? "");
  const [email, setEmail] = useState(pl?.email ?? "");
  const [telefone, setTelefone] = useState(pl?.telefone ?? "");
  const [responsavelNome, setResponsavelNome] = useState("");

  // Evento
  const [salaIds, setSalaIds] = useState<string[]>(
    prefill.salaId ? [prefill.salaId] : [],
  );
  const [data, setData] = useState(prefill.data ?? "");
  const [periodo, setPeriodo] = useState<PeriodoDia>(prefill.periodo ?? "manha");
  const [comboId, setComboId] = useState<string | null>(null);
  const faixaInicial = horarios[prefill.periodo ?? "manha"];
  const [horaInicio, setHoraInicio] = useState(faixaInicial.inicio);
  const [horaFim, setHoraFim] = useState(faixaInicial.fim);
  const [qtdPessoas, setQtdPessoas] = useState("");
  const [tipoEvento, setTipoEvento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [respostas, setRespostas] = useState<Record<string, RespostaValor>>({});
  const [diasOcupados, setDiasOcupados] = useState<Set<string>>(new Set());
  const [mesVisto, setMesVisto] = useState(() => mesDeData(prefill.data));

  // Coffee
  const [coffeeIncluir, setCoffeeIncluir] = useState(false);
  const [coffeeNivelId, setCoffeeNivelId] = useState(niveis[0]?.id ?? "");
  const [coffeeQtd, setCoffeeQtd] = useState("");
  const [coffeeHorario, setCoffeeHorario] = useState("");
  const [coffeeAdicionais, setCoffeeAdicionais] = useState<
    { descricao: string; valor: string }[]
  >([]);

  // Adicionais da locação (servicoAdicionalId vazio = texto livre)
  const [adicionais, setAdicionais] = useState<
    {
      servicoAdicionalId: string;
      descricao: string;
      quantidade: string;
      valor: string;
    }[]
  >([]);

  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | "">("");

  const [resumo, setResumo] = useState<ResumoValores | null>(null);
  const [disp, setDisp] = useState<DisponibilidadeSala[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [enviandoQual, setEnviandoQual] = useState<"criar" | "aprovar" | null>(
    null,
  );
  const [erro, setErro] = useState<string | null>(null);
  // Sobreposição (Spec 31 §7): pop-up de confirmação + intenção pendente.
  const [conflito, setConflito] = useState<ConflitoSobreposicao[] | null>(null);
  const [conflitoAprovar, setConflitoAprovar] = useState(false);
  // Lançamento retroativo (Spec 31 §6): evento passado, sem automações.
  const [retroativa, setRetroativa] = useState(false);
  const [retroativaResultado, setRetroativaResultado] = useState<
    "concluido" | "cancelado"
  >("concluido");
  const [retroativaPagamento, setRetroativaPagamento] = useState<
    "pago" | "pendente"
  >("pago");

  // Valor por sala editável (Spec 34): texto BRL exibido; "tocada" = o
  // colaborador já editou, então não sincroniza mais com a referência do
  // servidor. Desconto manual: sempre disponível, não depende de retroativa.
  const [valoresPorSalaTexto, setValoresPorSalaTexto] = useState<
    Record<string, string>
  >({});
  const [salasTocadas, setSalasTocadas] = useState<Set<string>>(new Set());
  const [descontoAtivo, setDescontoAtivo] = useState(false);
  const [descontoTipo, setDescontoTipo] = useState<"percentual" | "valor">(
    "percentual",
  );
  const [descontoValorTexto, setDescontoValorTexto] = useState("");
  const [descontoMotivo, setDescontoMotivo] = useState("");

  function editarValorSala(salaId: string, texto: string) {
    setValoresPorSalaTexto((p) => ({ ...p, [salaId]: texto }));
    setSalasTocadas((p) => new Set(p).add(salaId));
  }
  function restaurarValorReferencia(salaId: string, referenciaCentavos: number) {
    setValoresPorSalaTexto((p) => ({
      ...p,
      [salaId]: centavosParaBRL(referenciaCentavos),
    }));
    setSalasTocadas((p) => {
      const n = new Set(p);
      n.delete(salaId);
      return n;
    });
  }

  function trocarPeriodo(p: PeriodoDia) {
    setPeriodo(p);
    setHoraInicio(horarios[p].inicio);
    setHoraFim(horarios[p].fim);
  }

  function selecionarAssociado(a: AssociadoBusca) {
    setAssoc(a);
    setNome(a.razaoSocial ?? a.nome);
    setDocumento(mascararDocumento(a.documento ?? ""));
    setEmail(a.emails[0] ?? "");
    setTelefone(mascararTelefone(a.telefone ?? ""));
  }

  function toggleSala(id: string) {
    if (comboId) return; // salas travadas pelo combo
    setSalaIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  const assocAtivo =
    condicao === "associado" && assoc !== null && assoc.situacao === "ativo";
  const comboSel = combos.find((c) => c.id === comboId) ?? null;

  function selecionarCombo(c: ComboAplicavel) {
    setComboId(c.id);
    setSalaIds(c.salaIdsObrigatorias);
    if (c.periodo) trocarPeriodo(c.periodo);
    // Coffee obrigatório do combo (Spec 26): nível fixo → inclui e trava; ou
    // "qualquer" → só garante que o coffee esteja incluído.
    if (c.coffeeNivelId) {
      setCoffeeIncluir(true);
      setCoffeeNivelId(c.coffeeNivelId);
    } else if (c.coffeeQualquer) {
      setCoffeeIncluir(true);
    }
  }
  function removerCombo() {
    setComboId(null);
  }

  // Coffee exigido pelo combo (nível fixo OU qualquer) trava o toggle "incluir".
  const coffeeObrigatorioCombo = Boolean(
    comboSel?.coffeeNivelId || comboSel?.coffeeQualquer,
  );
  // O nível só é travado quando o combo fixa um específico.
  const coffeeNivelTravado = comboSel?.coffeeNivelId ?? null;

  // Combo exige sócio ativo — se o colaborador troca de locatário, cai o combo.
  useEffect(() => {
    if (comboId && !assocAtivo) setComboId(null);
  }, [comboId, assocAtivo]);

  const assocInativo =
    condicao === "associado" && assoc !== null && assoc.situacao !== "ativo";

  const capacidadeTotal = useMemo(
    () =>
      salas
        .filter((s) => salaIds.includes(s.id))
        .reduce((a, s) => a + s.capacidade, 0),
    [salas, salaIds],
  );
  const excedeCapacidade =
    qtdPessoas !== "" &&
    capacidadeTotal > 0 &&
    Number(qtdPessoas) > capacidadeTotal;

  const bloqueado = disp.some((d) =>
    ["ocupado", "evento_acimm", "bloqueio"].includes(d.estado),
  );

  const coffeeAdicionaisCentavos = coffeeAdicionais.reduce(
    (s, a) => s + brlParaCentavos(a.valor),
    0,
  );
  const catalogoCoffee =
    niveis.find((n) => n.id === coffeeNivelId)?.adicionais ?? [];
  const adicionaisCalc = adicionais
    .map((a) => ({
      quantidade: Number(a.quantidade.replace(",", ".")) || 0,
      valorUnitarioCentavos: brlParaCentavos(a.valor),
    }))
    .filter((a) => a.quantidade > 0);

  // Período gratuito do sócio: o colaborador pode recusar (guarda o uso).
  const [pgRecusado, setPgRecusado] = useState(false);

  // Ao trocar a seleção de salas, descarta valores/edições de salas que
  // saíram — uma sala re-adicionada depois começa "não tocada" de novo.
  useEffect(() => {
    setSalasTocadas((p) => new Set([...p].filter((id) => salaIds.includes(id))));
    setValoresPorSalaTexto((p) =>
      Object.fromEntries(
        Object.entries(p).filter(([id]) => salaIds.includes(id)),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [salaIds]);

  // Valor manual por sala (Spec 34): só envia override das salas que o
  // colaborador realmente editou — as demais seguem a referência do servidor.
  const valoresManuaisPorSalaCentavos: Record<string, number> = Object.fromEntries(
    [...salasTocadas]
      .filter((id) => salaIds.includes(id))
      .map((id): [string, number] => [
        id,
        brlParaCentavos(valoresPorSalaTexto[id] ?? "0"),
      ]),
  );
  const descontoManualValorNumerico =
    descontoTipo === "percentual"
      ? Number(descontoValorTexto.replace(",", "."))
      : brlParaCentavos(descontoValorTexto);
  const descontoManualPayload =
    descontoAtivo &&
    descontoValorTexto.trim() &&
    Number.isFinite(descontoManualValorNumerico) &&
    descontoManualValorNumerico > 0
      ? {
          tipo: descontoTipo,
          valor: descontoManualValorNumerico,
          motivo: descontoMotivo.trim() || undefined,
        }
      : null;

  // Resumo em tempo real (server recalcula — client só exibe).
  const associadoIdCalc = condicao === "associado" ? (assoc?.id ?? null) : null;
  const chaveResumo = JSON.stringify({
    salaIds,
    data,
    periodo,
    condicao,
    associadoIdCalc,
    pgRecusado,
    comboId,
    coffee: coffeeIncluir
      ? { coffeeNivelId, coffeeQtd, coffeeAdicionaisCentavos }
      : null,
    adicionaisCalc,
    valoresManuaisPorSalaCentavos,
    descontoManualPayload,
  });
  useEffect(() => {
    if (salaIds.length === 0 || !data) {
      setResumo(null);
      return;
    }
    let ativo = true;
    const t = setTimeout(async () => {
      const r = await calcularResumoAction({
        salaIds,
        data,
        periodo,
        condicao,
        associadoId: associadoIdCalc,
        periodoGratuitoRecusado: pgRecusado,
        comboId,
        coffee:
          coffeeIncluir && coffeeNivelId
            ? {
                nivelId: coffeeNivelId,
                qtdPessoas: Number(coffeeQtd) || Number(qtdPessoas) || 0,
                adicionaisCentavos: coffeeAdicionaisCentavos,
              }
            : null,
        adicionais: adicionaisCalc,
        valoresManuaisPorSala: valoresManuaisPorSalaCentavos,
        descontoManual: descontoManualPayload,
      });
      if (ativo) setResumo(r);
    }, 350);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveResumo]);

  // Sincroniza o texto exibido das salas NÃO tocadas com a referência que o
  // servidor acabou de calcular (ex.: mudou data/período/condição).
  useEffect(() => {
    if (!resumo) return;
    setValoresPorSalaTexto((p) => {
      const next = { ...p };
      let mudou = false;
      for (const s of resumo.salas) {
        if (salasTocadas.has(s.salaId)) continue;
        const texto = centavosParaBRL(s.valorCentavos);
        if (next[s.salaId] !== texto) {
          next[s.salaId] = texto;
          mudou = true;
        }
      }
      return mudou ? next : p;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumo]);

  // Disponibilidade inline.
  const chaveDisp = JSON.stringify({ salaIds, data, horaInicio, horaFim });
  useEffect(() => {
    if (salaIds.length === 0 || !data) {
      setDisp([]);
      return;
    }
    let ativo = true;
    const t = setTimeout(async () => {
      const r = await consultarDisponibilidadeAction({
        salaIds,
        data,
        horaInicio,
        horaFim,
      });
      if (ativo) setDisp(r);
    }, 350);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDisp]);

  // Dias ocupados das salas selecionadas no mês visível — marcados no calendário.
  const chaveOcupacoes = JSON.stringify({ salaIds, mesVisto });
  useEffect(() => {
    if (salaIds.length === 0) {
      setDiasOcupados(new Set());
      return;
    }
    let ativo = true;
    ocupacoesDaSalaAction({
      salaIds,
      ano: mesVisto.ano,
      mes: mesVisto.mes,
    }).then((dias) => {
      if (ativo) setDiasOcupados(new Set(dias));
    });
    return () => {
      ativo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveOcupacoes]);

  const nomeSala = useMemo(
    () => new Map(salas.map((s) => [s.id, s.nome])),
    [salas],
  );

  async function enviar(aprovar: boolean, sobrepor = false) {
    setErro(null);
    if (!nome.trim() || !documento.trim() || !email.trim()) {
      setErro("Preencha nome, documento e e-mail do locatário.");
      return;
    }
    if (!responsavelNome.trim()) {
      setErro("Informe o responsável pela locação (vai ao contrato).");
      return;
    }
    if (salaIds.length === 0 || !data) {
      setErro("Selecione sala(s) e data.");
      return;
    }
    if (resumo && resumo.salasSemPreco.length > 0) {
      setErro(
        "Informe o valor de todas as salas selecionadas (não há preço de referência para alguma delas nessa data).",
      );
      return;
    }
    if (
      retroativa &&
      retroativaResultado === "concluido" &&
      !formaPagamento &&
      (resumo?.totalCentavos ?? 0) > 0
    ) {
      setErro("Escolha a forma de pagamento do lançamento retroativo.");
      return;
    }
    setEnviando(true);
    setEnviandoQual(aprovar ? "aprovar" : "criar");
    const r = await criarLocacaoAssistida({
      condicao,
      associadoId: condicao === "associado" ? (assoc?.id ?? null) : null,
      locatarioNome: nome.trim(),
      locatarioDocumento: documento,
      locatarioEmail: email.trim(),
      locatarioTelefone: telefone.trim(),
      responsavelNome: responsavelNome.trim(),
      salaIds,
      data,
      periodo,
      horaInicio,
      horaFim,
      qtdPessoas: Number(qtdPessoas) || 0,
      tipoEvento: tipoEvento.trim(),
      observacoes: observacoes.trim(),
      respostasFormulario: respostas,
      coffee:
        coffeeIncluir && coffeeNivelId
          ? {
              nivelId: coffeeNivelId,
              qtdPessoas: Number(coffeeQtd) || Number(qtdPessoas) || 0,
              horarioServir: coffeeHorario || null,
              adicionais: coffeeAdicionais
                .filter((a) => a.descricao.trim())
                .map((a) => ({
                  descricao: a.descricao.trim(),
                  valorCentavos: brlParaCentavos(a.valor),
                })),
              observacoes: "",
            }
          : null,
      adicionais: adicionais
        .filter((a) => a.servicoAdicionalId || a.descricao.trim())
        .map((a) => ({
          servicoAdicionalId: a.servicoAdicionalId || null,
          descricao: a.descricao.trim(),
          quantidade: Number(a.quantidade.replace(",", ".")) || 1,
          valorUnitarioCentavos: brlParaCentavos(a.valor),
        })),
      formaPagamento: formaPagamento || null,
      aprovar,
      filaEsperaId: filaId,
      periodoGratuitoRecusado: pgRecusado,
      comboId,
      sobreposicaoAutorizada: sobrepor,
      retroativa,
      retroativaResultado,
      retroativaPagamento,
      valoresManuaisPorSala: valoresManuaisPorSalaCentavos,
      descontoManual: descontoManualPayload,
    });
    setEnviando(false);
    setEnviandoQual(null);

    // Sobreposição (Spec 31 §7): a locação NÃO foi criada; abre o pop-up.
    if (r.conflitoSobreposicao) {
      setConflito(r.conflitoSobreposicao);
      setConflitoAprovar(aprovar);
      return;
    }
    if (r.error) {
      setErro(r.error);
      return;
    }
    if (retroativa && retroativaResultado === "cancelado") {
      toast.success("Lançamento retroativo registrado (Cancelada).");
    } else if (r.concluida) {
      toast.success("Lançamento retroativo registrado (Concluída).");
    } else {
      toast.success(aprovar ? "Locação criada e aprovada." : "Locação criada.");
    }
    if (r.aviso) toast.warning(r.aviso);
    if (r.aprovacaoErro) toast.warning(`Aprovação: ${r.aprovacaoErro}`);
    router.push(`/admin/locacoes/${r.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
      {filaId ? (
        <div className="rounded-lg border border-brand/30 bg-brand/5 px-3 py-2 text-sm text-ink">
          Convertendo um interessado da{" "}
          <span className="font-medium">lista de espera</span>. Ao salvar, a
          entrada é marcada como convertida.
        </div>
      ) : null}

      {/* Locatário */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink">Locatário</h3>
          <div className="flex gap-1.5">
            {CONDICOES.map((c) => (
              <button
                key={c.valor}
                type="button"
                onClick={() => setCondicao(c.valor)}
                className={
                  condicao === c.valor
                    ? "rounded-full border border-brand bg-brand/10 px-3 py-1 text-xs font-medium text-brand"
                    : "rounded-full border px-3 py-1 text-xs text-ink-muted hover:text-ink"
                }
              >
                {c.rotulo}
              </button>
            ))}
          </div>

          {condicao === "associado" ? (
            <>
              <AssociadoAutocomplete aoSelecionar={selecionarAssociado} />
              {assoc ? (
                <div className="rounded-md bg-surface-muted px-3 py-2 text-xs text-ink-muted">
                  Vinculado a <span className="text-ink">{assoc.nome}</span> ·
                  situação {assoc.situacao}
                </div>
              ) : null}
              {assoc && assoc.emails.length > 1 ? (
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="email-sel">E-mail (contrato/notificações)</Label>
                  <select
                    id="email-sel"
                    className={inputClasses}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  >
                    {assoc.emails.map((em) => (
                      <option key={em} value={em}>
                        {em}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              {assocInativo ? (
                <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div>
                    <p className="text-ink">
                      Associado {assoc?.situacao} — não pode locar com condição de
                      sócio.
                    </p>
                    <button
                      type="button"
                      onClick={() => setCondicao("nao_associado")}
                      className="mt-1 text-xs font-medium text-brand hover:underline"
                    >
                      Prosseguir como não-associado (preço cheio), mantendo os
                      dados
                    </button>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="nome">Nome / Razão social</Label>
              <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc">CNPJ / CPF</Label>
              <Input
                id="doc"
                value={documento}
                onChange={(e) => setDocumento(mascararDocumento(e.target.value))}
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tel">Telefone</Label>
              <Input
                id="tel"
                value={telefone}
                onChange={(e) => setTelefone(mascararTelefone(e.target.value))}
                placeholder="(00) 00000-0000"
                inputMode="tel"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="responsavel">Responsável pela locação *</Label>
              <Input
                id="responsavel"
                value={responsavelNome}
                onChange={(e) => setResponsavelNome(e.target.value)}
                placeholder="Quem assina e responde pela reserva (vai ao contrato)"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Evento */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink">Evento</h3>

          {/* Combos (exclusivos de sócio ativo) */}
          {assocAtivo && combos.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <Label>Combos (opcional)</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {combos.map((c) => {
                  const sel = comboId === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => (sel ? removerCombo() : selecionarCombo(c))}
                      className={
                        sel
                          ? "flex flex-col items-start rounded-lg border border-brand bg-brand/10 px-3 py-2 text-left"
                          : "flex flex-col items-start rounded-lg border px-3 py-2 text-left hover:bg-surface-muted"
                      }
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
                    onClick={removerCombo}
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
              {salas.map((s) => {
                const sel = salaIds.includes(s.id);
                const est = disp.find((d) => d.salaId === s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    disabled={comboId !== null}
                    onClick={() => toggleSala(s.id)}
                    className={
                      sel
                        ? "flex flex-col items-start rounded-lg border border-brand bg-brand/5 px-3 py-2 text-left disabled:opacity-70"
                        : "flex flex-col items-start rounded-lg border px-3 py-2 text-left hover:bg-surface-muted disabled:opacity-50"
                    }
                  >
                    <span className="text-sm font-medium text-ink">{s.nome}</span>
                    <span className="text-xs text-ink-muted">
                      {s.capacidade} lugares
                    </span>
                    {sel && est ? (
                      <span className={`text-xs ${ESTADO_ROTULO[est.estado].classe}`}>
                        {ESTADO_ROTULO[est.estado].texto}
                        {est.ocupante ? ` — ${est.ocupante}` : ""}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-4">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="data">Data</Label>
              <DatePicker
                id="data"
                value={data}
                onChange={setData}
                diasOcupados={diasOcupados}
                aoMudarMes={(ano, mes) => setMesVisto({ ano, mes })}
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="periodo">Período</Label>
              <select
                id="periodo"
                className={inputClasses}
                value={periodo}
                disabled={comboSel?.periodo != null}
                onChange={(e) => trocarPeriodo(e.target.value as PeriodoDia)}
              >
                {PERIODOS.map((p) => (
                  <option key={p.valor} value={p.valor}>
                    {p.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hi">Início</Label>
              <Input
                id="hi"
                type="time"
                value={horaInicio}
                onChange={(e) => setHoraInicio(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hf">Fim</Label>
              <Input
                id="hf"
                type="time"
                value={horaFim}
                onChange={(e) => setHoraFim(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="qtd">Pessoas</Label>
              <Input
                id="qtd"
                type="number"
                min={1}
                value={qtdPessoas}
                onChange={(e) => setQtdPessoas(e.target.value)}
              />
            </div>
          </div>
          <p className="text-xs text-ink-muted">
            O preço é o do período; tempo além do período entra como adicional
            (hora extra).
          </p>
          {excedeCapacidade ? (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              Atenção: {qtdPessoas} pessoas excede a capacidade somada (
              {capacidadeTotal}). Permitido, fica registrado.
            </p>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
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
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="obs">Observações</Label>
            <textarea
              id="obs"
              rows={2}
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              className="min-h-16 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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

      {/* Coffee */}
      {niveis.length > 0 ? (
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
                      onChange={(e) => setCoffeeNivelId(e.target.value)}
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
                {catalogoCoffee.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    <p className="text-xs font-medium text-ink-muted">
                      Adicionais do nível (clique para incluir)
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {catalogoCoffee.map((a) => (
                        <button
                          key={`${a.descricao}-${a.valorCentavos}`}
                          type="button"
                          onClick={() =>
                            setCoffeeAdicionais((p) => [
                              ...p,
                              {
                                descricao: a.descricao,
                                valor: (a.valorCentavos / 100)
                                  .toFixed(2)
                                  .replace(".", ","),
                              },
                            ])
                          }
                          className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs text-ink-muted hover:border-brand hover:text-brand"
                        >
                          <Plus className="size-3" />
                          {a.descricao} · {centavosParaBRL(a.valorCentavos)}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
                <LinhasValor
                  titulo="Adicionais do coffee"
                  itens={coffeeAdicionais}
                  aoMudar={setCoffeeAdicionais}
                />
              </>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <p className="text-xs text-ink-muted">
          Níveis de coffee ainda não configurados.
        </p>
      )}

      {/* Adicionais */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink">Adicionais da locação</h3>
          <LinhasAdicional
            itens={adicionais}
            aoMudar={setAdicionais}
            servicos={servicos.filter((s) =>
              servicoDisponivelPara(s.salaId, salaIds),
            )}
          />
        </CardContent>
      </Card>

      {/* Pagamento + resumo */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink">Pagamento e resumo</h3>
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor="forma">Forma de pagamento preferida</Label>
            <select
              id="forma"
              className={inputClasses}
              value={formaPagamento}
              onChange={(e) =>
                setFormaPagamento(e.target.value as FormaPagamento | "")
              }
            >
              <option value="">Selecione…</option>
              {FORMAS_PAGAMENTO.map((f) => (
                <option key={f.valor} value={f.valor}>
                  {f.rotulo}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-md border bg-surface-muted p-3 text-sm">
            {!resumo ? (
              <p className="text-ink-muted">
                Selecione sala(s) e data para ver o resumo.
              </p>
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
                  <div key={s.salaId} className="flex flex-col gap-0.5 py-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-ink-muted">
                        {nomeSala.get(s.salaId) ?? s.nome}
                      </span>
                      <Input
                        aria-label={`Valor da sala ${nomeSala.get(s.salaId) ?? s.nome}`}
                        className="h-7 w-28 text-right text-sm"
                        value={valoresPorSalaTexto[s.salaId] ?? ""}
                        onChange={(e) => editarValorSala(s.salaId, e.target.value)}
                        placeholder="R$ 0,00"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      {s.referenciaCentavos == null ? (
                        <span className="text-destructive">
                          Sem preço de referência para esta data/condição —
                          informe o valor.
                        </span>
                      ) : s.valorCentavos !== s.referenciaCentavos ? (
                        <span className="text-ink-muted">
                          Referência: {centavosParaBRL(s.referenciaCentavos)}
                        </span>
                      ) : (
                        <span />
                      )}
                      {salasTocadas.has(s.salaId) && s.referenciaCentavos != null ? (
                        <button
                          type="button"
                          className="text-brand hover:underline"
                          onClick={() =>
                            restaurarValorReferencia(
                              s.salaId,
                              s.referenciaCentavos as number,
                            )
                          }
                        >
                          usar valor de referência
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
                {resumo.coffeeCentavos > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Coffee</span>
                    <span className="text-ink">
                      {centavosParaBRL(resumo.coffeeCentavos)}
                    </span>
                  </div>
                ) : null}
                {resumo.adicionaisCentavos > 0 ? (
                  <div className="flex justify-between">
                    <span className="text-ink-muted">Adicionais</span>
                    <span className="text-ink">
                      {centavosParaBRL(resumo.adicionaisCentavos)}
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

                <div className="mt-1 flex flex-col gap-2 rounded-md border border-dashed px-2.5 py-2">
                  <label className="flex cursor-pointer items-center gap-2 text-xs">
                    <input
                      type="checkbox"
                      className="size-3.5"
                      checked={descontoAtivo}
                      onChange={(e) => setDescontoAtivo(e.target.checked)}
                    />
                    <span className="font-medium text-ink">
                      Aplicar desconto manual
                    </span>
                  </label>
                  {descontoAtivo ? (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => setDescontoTipo("percentual")}
                          className={
                            descontoTipo === "percentual"
                              ? "rounded-full border border-brand bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand"
                              : "rounded-full border px-2.5 py-0.5 text-xs text-ink-muted"
                          }
                        >
                          Percentual
                        </button>
                        <button
                          type="button"
                          onClick={() => setDescontoTipo("valor")}
                          className={
                            descontoTipo === "valor"
                              ? "rounded-full border border-brand bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand"
                              : "rounded-full border px-2.5 py-0.5 text-xs text-ink-muted"
                          }
                        >
                          Valor em R$
                        </button>
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2">
                        <Input
                          className="h-8 text-sm"
                          value={descontoValorTexto}
                          onChange={(e) => setDescontoValorTexto(e.target.value)}
                          placeholder={
                            descontoTipo === "percentual" ? "Ex.: 10" : "Ex.: 50,00"
                          }
                          inputMode="decimal"
                        />
                        <Input
                          className="h-8 text-sm"
                          value={descontoMotivo}
                          onChange={(e) => setDescontoMotivo(e.target.value)}
                          placeholder="Motivo (opcional)"
                        />
                      </div>
                    </div>
                  ) : null}
                </div>

                {resumo.periodoGratuito &&
                (resumo.periodoGratuito.elegivel ||
                  resumo.periodoGratuito.motivo === "esgotado") ? (
                  <div className="mt-1 rounded-md bg-brand/5 px-2.5 py-2 text-xs">
                    {resumo.periodoGratuito.motivo === "esgotado" ? (
                      <span className="text-ink-muted">
                        Benefício desta sala já utilizado no mês · renova em{" "}
                        {renovaEm(resumo.periodoGratuito.ciclo)}.
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
                          Aplicar período gratuito do associado (uso{" "}
                          {resumo.periodoGratuito.usoAtual + 1} de{" "}
                          {resumo.periodoGratuito.limite} desta sala no mês).
                          Desmarque para guardar o uso para outra data.
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

          {bloqueado ? (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              Uma das salas está ocupada nesse horário. Ao criar, será solicitada
              a confirmação de sobreposição.
            </p>
          ) : null}
          {resumo && resumo.salasSemPreco.length > 0 ? (
            <p className="text-sm text-destructive">
              Não há preço de referência para alguma sala nesse
              período/condição/data — informe o valor manualmente acima.
            </p>
          ) : null}
          {resumo?.aviso ? (
            <p className="rounded-md bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
              {resumo.aviso}
            </p>
          ) : null}
          {erro ? (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          ) : null}

          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-dashed px-3 py-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 size-3.5"
              checked={retroativa}
              onChange={(e) => setRetroativa(e.target.checked)}
            />
            <span className="text-ink-muted">
              <span className="font-medium text-ink">Lançamento retroativo</span>{" "}
              — evento que já aconteceu, sem enviar mensagens, contrato ou
              convite de agenda ao associado.
            </span>
          </label>

          {retroativa ? (
            <div className="flex flex-col gap-3 rounded-md border border-dashed px-3 py-2">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-ink-muted">
                  Resultado do evento
                </span>
                <div className="flex gap-3 text-sm">
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name="retroativa-resultado"
                      checked={retroativaResultado === "concluido"}
                      onChange={() => setRetroativaResultado("concluido")}
                    />
                    Concluído
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5">
                    <input
                      type="radio"
                      name="retroativa-resultado"
                      checked={retroativaResultado === "cancelado"}
                      onChange={() => setRetroativaResultado("cancelado")}
                    />
                    Cancelado
                  </label>
                </div>
              </div>

              {retroativaResultado === "concluido" ? (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium text-ink-muted">
                    Pagamento
                  </span>
                  <div className="flex gap-3 text-sm">
                    <label className="flex cursor-pointer items-center gap-1.5">
                      <input
                        type="radio"
                        name="retroativa-pagamento"
                        checked={retroativaPagamento === "pago"}
                        onChange={() => setRetroativaPagamento("pago")}
                      />
                      Pago
                    </label>
                    <label className="flex cursor-pointer items-center gap-1.5">
                      <input
                        type="radio"
                        name="retroativa-pagamento"
                        checked={retroativaPagamento === "pendente"}
                        onChange={() => setRetroativaPagamento("pendente")}
                      />
                      Pendente
                    </label>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-ink-muted">
                  Evento cancelado: a locação é registrada direto como
                  cancelada, sem pagamento nem comissão.
                </p>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {retroativa ? (
              <Button
                loading={enviando}
                disabled={enviando}
                onClick={() => enviar(false)}
              >
                Registrar lançamento retroativo
              </Button>
            ) : (
              <>
                <Button
                  loading={enviandoQual === "criar"}
                  disabled={enviando}
                  onClick={() => enviar(false)}
                >
                  Criar solicitação
                </Button>
                <Button
                  variant="outline"
                  loading={enviandoQual === "aprovar"}
                  disabled={enviando}
                  onClick={() => enviar(true)}
                >
                  Criar e aprovar
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={conflito !== null}
        onOpenChange={(aberto) => {
          if (!aberto) setConflito(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sobreposição de horário</AlertDialogTitle>
            <AlertDialogDescription>
              Este horário já está ocupado. Confirmar cria uma segunda locação no
              mesmo período (sobreposição autorizada), registrando você como
              responsável pela decisão.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {conflito && conflito.length > 0 ? (
            <ul className="flex flex-col gap-1 rounded-md bg-surface-muted p-3 text-sm">
              {conflito.map((c, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: lista efêmera de conflito
                <li key={i} className="flex justify-between gap-2">
                  {c.salaNome ? (
                    <span className="text-ink-muted">{c.salaNome}</span>
                  ) : null}
                  <span className="text-ink">{c.ocupante}</span>
                </li>
              ))}
            </ul>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConflito(null);
                enviar(conflitoAprovar, true);
              }}
            >
              Confirmar sobreposição
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/** Linhas descrição + valor (adicionais do coffee). */
function LinhasValor({
  titulo,
  itens,
  aoMudar,
}: {
  titulo: string;
  itens: { descricao: string; valor: string }[];
  aoMudar: (v: { descricao: string; valor: string }[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-ink-muted">{titulo}</p>
      {itens.map((it, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: linhas efêmeras de formulário
        <div key={i} className="flex gap-2">
          <Input
            value={it.descricao}
            onChange={(e) => {
              const c = [...itens];
              c[i] = { ...c[i], descricao: e.target.value };
              aoMudar(c);
            }}
            placeholder="Descrição"
          />
          <Input
            value={it.valor}
            inputMode="decimal"
            onChange={(e) => {
              const c = [...itens];
              c[i] = { ...c[i], valor: e.target.value };
              aoMudar(c);
            }}
            placeholder="0,00"
            className="w-28"
          />
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Remover"
            onClick={() => aoMudar(itens.filter((_, j) => j !== i))}
          >
            <X className="size-4" />
          </Button>
        </div>
      ))}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => aoMudar([...itens, { descricao: "", valor: "" }])}
        >
          <Plus className="size-4" />
          Adicionar
        </Button>
      </div>
    </div>
  );
}

/** Linhas de adicional: catálogo (auto-preenche) ou texto livre. */
type LinhaAdicional = {
  servicoAdicionalId: string;
  descricao: string;
  quantidade: string;
  valor: string;
};

function LinhasAdicional({
  itens,
  aoMudar,
  servicos,
}: {
  itens: LinhaAdicional[];
  aoMudar: (v: LinhaAdicional[]) => void;
  servicos: ServicoAdicional[];
}) {
  const porId = new Map(servicos.map((s) => [s.id, s]));

  function atualizar(i: number, patch: Partial<LinhaAdicional>) {
    const c = [...itens];
    c[i] = { ...c[i], ...patch };
    aoMudar(c);
  }
  function escolher(i: number, id: string) {
    const s = porId.get(id);
    if (!s) {
      atualizar(i, { servicoAdicionalId: "", descricao: "", valor: "", quantidade: "1" });
      return;
    }
    atualizar(i, {
      servicoAdicionalId: s.id,
      descricao: s.nome,
      quantidade: "1",
      valor:
        s.valorUnitarioCentavos != null
          ? (s.valorUnitarioCentavos / 100).toFixed(2).replace(".", ",")
          : "",
    });
  }

  const sel =
    "h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <div className="flex flex-col gap-2">
      {itens.map((it, i) => {
        const sv = it.servicoAdicionalId
          ? (porId.get(it.servicoAdicionalId) ?? null)
          : null;
        const valorTravado = sv != null && !exigeValorManual(sv.modeloCobranca);
        const mostraQtd = !sv || usaQuantidade(sv.modeloCobranca);
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: linhas efêmeras de formulário
          <div key={i} className="flex flex-col gap-1.5 rounded-lg border p-2">
            {servicos.length > 0 ? (
              <select
                className={sel}
                value={it.servicoAdicionalId}
                onChange={(e) => escolher(i, e.target.value)}
              >
                <option value="">Texto livre</option>
                {servicos.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                    {s.valorUnitarioCentavos != null
                      ? ` — ${centavosParaBRL(s.valorUnitarioCentavos)}`
                      : " — sob consulta"}
                  </option>
                ))}
              </select>
            ) : null}
            <div className="flex gap-2">
              <Input
                value={it.descricao}
                onChange={(e) => atualizar(i, { descricao: e.target.value })}
                placeholder="Descrição (ex.: hora extra)"
                readOnly={sv != null}
              />
              {mostraQtd ? (
                <Input
                  value={it.quantidade}
                  inputMode="decimal"
                  onChange={(e) => atualizar(i, { quantidade: e.target.value })}
                  placeholder="Qtd"
                  className="w-20"
                />
              ) : null}
              <Input
                value={it.valor}
                inputMode="decimal"
                onChange={(e) => atualizar(i, { valor: e.target.value })}
                placeholder={sv && !valorTravado ? "cotação" : "Unit. 0,00"}
                readOnly={valorTravado}
                className="w-28"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Remover"
                onClick={() => aoMudar(itens.filter((_, j) => j !== i))}
              >
                <X className="size-4" />
              </Button>
            </div>
          </div>
        );
      })}
      <div>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            aoMudar([
              ...itens,
              { servicoAdicionalId: "", descricao: "", quantidade: "1", valor: "" },
            ])
          }
        >
          <Plus className="size-4" />
          Adicionar
        </Button>
      </div>
    </div>
  );
}
