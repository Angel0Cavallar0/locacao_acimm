"use client";

import { AlertTriangle, Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CONDICOES,
  type CondicaoLocatario,
  PERIODOS,
  type PeriodoDia,
} from "@/lib/dominio";
import type { HorariosPeriodos } from "@/lib/locacoes/horarios";
import { DatePicker } from "@/components/ui/date-picker";
import { FORMAS_PAGAMENTO } from "@/lib/locacoes/tipos";
import type { FormaPagamento } from "@/lib/locacoes/tipos";
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
  DisponibilidadeSala,
  ResumoValores,
} from "./tipos";

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

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

interface Campo {
  id: string;
  rotulo: string;
  tipo: string;
  opcoes: string[];
  obrigatorio: boolean;
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
}: {
  salas: { id: string; nome: string; capacidade: number }[];
  niveis: { id: string; nome: string; valor_pessoa_centavos: number }[];
  campos: Campo[];
  horarios: HorariosPeriodos;
  prefill: { salaId: string | null; data: string | null; periodo: PeriodoDia | null };
}) {
  const router = useRouter();

  // Locatário
  const [condicao, setCondicao] = useState<CondicaoLocatario>("associado");
  const [assoc, setAssoc] = useState<AssociadoBusca | null>(null);
  const [nome, setNome] = useState("");
  const [documento, setDocumento] = useState("");
  const [email, setEmail] = useState("");
  const [telefone, setTelefone] = useState("");
  const [responsavelNome, setResponsavelNome] = useState("");

  // Evento
  const [salaIds, setSalaIds] = useState<string[]>(
    prefill.salaId ? [prefill.salaId] : [],
  );
  const [data, setData] = useState(prefill.data ?? "");
  const [periodo, setPeriodo] = useState<PeriodoDia>(prefill.periodo ?? "manha");
  const faixaInicial = horarios[prefill.periodo ?? "manha"];
  const [horaInicio, setHoraInicio] = useState(faixaInicial.inicio);
  const [horaFim, setHoraFim] = useState(faixaInicial.fim);
  const [qtdPessoas, setQtdPessoas] = useState("");
  const [tipoEvento, setTipoEvento] = useState("");
  const [observacoes, setObservacoes] = useState("");
  const [respostas, setRespostas] = useState<Record<string, string>>({});
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

  // Adicionais da locação
  const [adicionais, setAdicionais] = useState<
    { descricao: string; quantidade: string; valor: string }[]
  >([]);

  const [formaPagamento, setFormaPagamento] = useState<FormaPagamento | "">("");

  const [resumo, setResumo] = useState<ResumoValores | null>(null);
  const [disp, setDisp] = useState<DisponibilidadeSala[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [enviandoQual, setEnviandoQual] = useState<"criar" | "aprovar" | null>(
    null,
  );
  const [erro, setErro] = useState<string | null>(null);

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
    setSalaIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

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
  const adicionaisCalc = adicionais
    .map((a) => ({
      quantidade: Number(a.quantidade.replace(",", ".")) || 0,
      valorUnitarioCentavos: brlParaCentavos(a.valor),
    }))
    .filter((a) => a.quantidade > 0);

  // Resumo em tempo real (server recalcula — client só exibe).
  const chaveResumo = JSON.stringify({
    salaIds,
    data,
    periodo,
    condicao,
    coffee: coffeeIncluir
      ? { coffeeNivelId, coffeeQtd, coffeeAdicionaisCentavos }
      : null,
    adicionaisCalc,
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
        coffee:
          coffeeIncluir && coffeeNivelId
            ? {
                nivelId: coffeeNivelId,
                qtdPessoas: Number(coffeeQtd) || Number(qtdPessoas) || 0,
                adicionaisCentavos: coffeeAdicionaisCentavos,
              }
            : null,
        adicionais: adicionaisCalc,
      });
      if (ativo) setResumo(r);
    }, 350);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveResumo]);

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

  async function enviar(aprovar: boolean) {
    setErro(null);
    if (!nome.trim() || !documento.trim() || !email.trim()) {
      setErro("Preencha nome, documento e e-mail do locatário.");
      return;
    }
    if (salaIds.length === 0 || !data) {
      setErro("Selecione sala(s) e data.");
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
        .filter((a) => a.descricao.trim())
        .map((a) => ({
          descricao: a.descricao.trim(),
          quantidade: Number(a.quantidade.replace(",", ".")) || 1,
          valorUnitarioCentavos: brlParaCentavos(a.valor),
        })),
      formaPagamento: formaPagamento || null,
      aprovar,
    });
    setEnviando(false);
    setEnviandoQual(null);

    if (r.error) {
      setErro(r.error);
      return;
    }
    toast.success(aprovar ? "Locação criada e aprovada." : "Locação criada.");
    if (r.aprovacaoErro) toast.warning(`Aprovação: ${r.aprovacaoErro}`);
    router.push(`/admin/locacoes/${r.id}`);
  }

  return (
    <div className="flex flex-col gap-4">
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
              <Label htmlFor="responsavel">Responsável pela locação</Label>
              <Input
                id="responsavel"
                value={responsavelNome}
                onChange={(e) => setResponsavelNome(e.target.value)}
                placeholder="Pessoa que responde pela reserva"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Evento */}
      <Card>
        <CardContent className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink">Evento</h3>

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
                    onClick={() => toggleSala(s.id)}
                    className={
                      sel
                        ? "flex flex-col items-start rounded-lg border border-brand bg-brand/5 px-3 py-2 text-left"
                        : "flex flex-col items-start rounded-lg border px-3 py-2 text-left hover:bg-surface-muted"
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

          {campos.length > 0 ? (
            <div className="flex flex-col gap-3 border-t pt-3">
              <p className="text-xs font-medium text-ink-muted">
                Informações adicionais
              </p>
              {campos.map((c) => (
                <div key={c.id} className="flex flex-col gap-1.5">
                  <Label htmlFor={`campo-${c.id}`}>
                    {c.rotulo}
                    {c.obrigatorio ? " *" : ""}
                  </Label>
                  {c.tipo === "texto_longo" ? (
                    <textarea
                      id={`campo-${c.id}`}
                      rows={2}
                      value={respostas[c.rotulo] ?? ""}
                      onChange={(e) =>
                        setRespostas((r) => ({ ...r, [c.rotulo]: e.target.value }))
                      }
                      className="min-h-16 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    />
                  ) : c.tipo === "selecao" ? (
                    <select
                      id={`campo-${c.id}`}
                      className={inputClasses}
                      value={respostas[c.rotulo] ?? ""}
                      onChange={(e) =>
                        setRespostas((r) => ({ ...r, [c.rotulo]: e.target.value }))
                      }
                    >
                      <option value="">Selecione…</option>
                      {c.opcoes.map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : c.tipo === "data" ? (
                    <DatePicker
                      id={`campo-${c.id}`}
                      value={respostas[c.rotulo] ?? ""}
                      onChange={(v) =>
                        setRespostas((r) => ({ ...r, [c.rotulo]: v }))
                      }
                    />
                  ) : (
                    <Input
                      id={`campo-${c.id}`}
                      type={c.tipo === "numero" ? "number" : "text"}
                      value={respostas[c.rotulo] ?? ""}
                      onChange={(e) =>
                        setRespostas((r) => ({ ...r, [c.rotulo]: e.target.value }))
                      }
                    />
                  )}
                </div>
              ))}
            </div>
          ) : null}
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
                onChange={(e) => setCoffeeIncluir(e.target.checked)}
              />
              <span className="text-sm font-semibold text-ink">
                Incluir coffee break
              </span>
            </label>
            {coffeeIncluir ? (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="cn">Nível</Label>
                    <select
                      id="cn"
                      className={inputClasses}
                      value={coffeeNivelId}
                      onChange={(e) => setCoffeeNivelId(e.target.value)}
                    >
                      {niveis.map((n) => (
                        <option key={n.id} value={n.id}>
                          {n.nome} — {centavosParaBRL(n.valor_pessoa_centavos)}/pessoa
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
          <LinhasAdicional itens={adicionais} aoMudar={setAdicionais} />
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
                {resumo.salas.map((s) => (
                  <div key={s.salaId} className="flex justify-between">
                    <span className="text-ink-muted">
                      {nomeSala.get(s.salaId) ?? s.nome}
                    </span>
                    <span className={s.semPreco ? "text-destructive" : "text-ink"}>
                      {s.semPreco
                        ? "sem preço"
                        : centavosParaBRL(s.valorCentavos)}
                    </span>
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
                <div className="flex justify-between">
                  <span className="text-ink-muted">
                    Descontos{" "}
                    <span className="text-xs">(regras em breve)</span>
                  </span>
                  <span className="text-ink">R$ 0,00</span>
                </div>
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
            <p className="text-sm text-destructive">
              Uma das salas está indisponível no horário — ajuste antes de criar.
            </p>
          ) : null}
          {resumo && resumo.salasSemPreco.length > 0 ? (
            <p className="text-sm text-destructive">
              Há sala sem preço cadastrado para este período/condição/data.
            </p>
          ) : null}
          {erro ? (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              loading={enviandoQual === "criar"}
              disabled={enviando || bloqueado}
              onClick={() => enviar(false)}
            >
              Criar solicitação
            </Button>
            <Button
              variant="outline"
              loading={enviandoQual === "aprovar"}
              disabled={enviando || bloqueado}
              onClick={() => enviar(true)}
            >
              Criar e aprovar
            </Button>
          </div>
        </CardContent>
      </Card>
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

/** Linhas descrição + quantidade + valor unitário (adicionais da locação). */
function LinhasAdicional({
  itens,
  aoMudar,
}: {
  itens: { descricao: string; quantidade: string; valor: string }[];
  aoMudar: (v: { descricao: string; quantidade: string; valor: string }[]) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
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
            placeholder="Descrição (ex.: hora extra)"
          />
          <Input
            value={it.quantidade}
            inputMode="decimal"
            onChange={(e) => {
              const c = [...itens];
              c[i] = { ...c[i], quantidade: e.target.value };
              aoMudar(c);
            }}
            placeholder="Qtd"
            className="w-20"
          />
          <Input
            value={it.valor}
            inputMode="decimal"
            onChange={(e) => {
              const c = [...itens];
              c[i] = { ...c[i], valor: e.target.value };
              aoMudar(c);
            }}
            placeholder="Unit. 0,00"
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
          onClick={() =>
            aoMudar([...itens, { descricao: "", quantidade: "1", valor: "" }])
          }
        >
          <Plus className="size-4" />
          Adicionar
        </Button>
      </div>
    </div>
  );
}
