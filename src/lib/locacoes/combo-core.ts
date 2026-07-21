/**
 * Aplicação de combos — lógica PURA (Spec 20 §3, parte 2). Sem I/O: os preços de
 * sala (resolverPreco) e a definição do combo são resolvidos em `calcular.ts` e
 * passados aqui. Escopo: `desconto_multi_sala` e `evento_privativo`
 * (`assinatura_mensal` adiada). Testável no `node --test`.
 */

export type MotivoComboInelegivel =
  | "nao_associado"
  | "combo_inativo"
  | "salas_incompletas"
  | "periodo_incompativel"
  | "salas_faltando_privativo"
  | "coffee_faltando";

export interface EntradaElegibilidadeCombo {
  condicao: string; // 'associado' | 'nao_associado'
  associadoAtivo: boolean;
  ativo: boolean; // combo.ativo
  tipo: string; // 'desconto_multi_sala' | 'evento_privativo'
  comboSalaIds: string[]; // salas do combo (multi_sala)
  salasSelecionadas: string[];
  todasSalasAtivasIds: string[]; // p/ evento_privativo
  comboPeriodo: string | null;
  periodo: string;
  /** Nível de coffee obrigatório do combo (multi-sala), ou null (Spec 26). */
  comboCoffeeNivelId?: string | null;
  /** Combo exige qualquer coffee (sem fixar nível) — Spec 26. */
  comboCoffeeQualquer?: boolean;
  /** Nível de coffee incluído na reserva, ou null. */
  coffeeNivelIdSelecionado?: string | null;
}

export interface ResultadoElegibilidadeCombo {
  elegivel: boolean;
  motivo?: MotivoComboInelegivel;
}

function mesmoConjunto(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sb = new Set(b);
  return a.every((x) => sb.has(x));
}

function contemTodos(conjunto: string[], necessarios: string[]): boolean {
  const s = new Set(conjunto);
  return necessarios.every((x) => s.has(x));
}

export function avaliarElegibilidadeCombo(
  e: EntradaElegibilidadeCombo,
): ResultadoElegibilidadeCombo {
  if (e.condicao !== "associado" || !e.associadoAtivo) {
    return { elegivel: false, motivo: "nao_associado" };
  }
  if (!e.ativo) {
    return { elegivel: false, motivo: "combo_inativo" };
  }
  if (e.tipo === "evento_privativo") {
    if (!mesmoConjunto(e.salasSelecionadas, e.todasSalasAtivasIds)) {
      return { elegivel: false, motivo: "salas_faltando_privativo" };
    }
    if (e.comboPeriodo && e.periodo !== e.comboPeriodo) {
      return { elegivel: false, motivo: "periodo_incompativel" };
    }
    return { elegivel: true };
  }
  // desconto_multi_sala: a reserva precisa conter TODAS as salas do combo.
  if (!contemTodos(e.salasSelecionadas, e.comboSalaIds)) {
    return { elegivel: false, motivo: "salas_incompletas" };
  }
  if (e.comboPeriodo && e.periodo !== e.comboPeriodo) {
    return { elegivel: false, motivo: "periodo_incompativel" };
  }
  // Coffee obrigatório (Spec 26). Dois modos:
  //  - nível específico: a reserva precisa incluir exatamente esse nível;
  //  - qualquer: basta incluir ALGUM coffee break.
  if (
    e.comboCoffeeNivelId &&
    e.coffeeNivelIdSelecionado !== e.comboCoffeeNivelId
  ) {
    return { elegivel: false, motivo: "coffee_faltando" };
  }
  if (
    !e.comboCoffeeNivelId &&
    e.comboCoffeeQualquer &&
    !e.coffeeNivelIdSelecionado
  ) {
    return { elegivel: false, motivo: "coffee_faltando" };
  }
  return { elegivel: true };
}

export interface SalaValor {
  salaId: string;
  valorCentavos: number;
}

/**
 * Rateia um valor fechado entre salas, proporcional ao preço de referência de
 * cada uma. `floor` por item e o **resto vai todo no 1º** → a soma bate exata
 * com o total. Sem referência (todas 0) → divisão igual + resto no 1º.
 */
export function ratearValorFechado(
  refs: SalaValor[],
  totalCentavos: number,
): SalaValor[] {
  if (refs.length === 0) return [];
  const somaRef = refs.reduce((s, r) => s + Math.max(0, r.valorCentavos), 0);
  const out = refs.map((r) => ({
    salaId: r.salaId,
    valorCentavos:
      somaRef > 0
        ? Math.floor((totalCentavos * Math.max(0, r.valorCentavos)) / somaRef)
        : Math.floor(totalCentavos / refs.length),
  }));
  const somaOut = out.reduce((s, o) => s + o.valorCentavos, 0);
  out[0].valorCentavos += totalCentavos - somaOut;
  return out;
}

/**
 * Linhas de desconto do `desconto_multi_sala`: desconta só nas salas marcadas
 * `aplica_desconto`. Percentual arredondado; valor fixo limitado ao preço da sala.
 */
export function calcularDescontoMultiSala(
  salas: SalaValor[],
  salaIdsComDesconto: string[],
  tipoDesconto: string, // 'percentual' | 'valor'
  descontoValor: number,
): SalaValor[] {
  const set = new Set(salaIdsComDesconto);
  const linhas: SalaValor[] = [];
  for (const s of salas) {
    if (!set.has(s.salaId)) continue;
    const desc =
      tipoDesconto === "percentual"
        ? Math.round((s.valorCentavos * descontoValor) / 100)
        : Math.min(descontoValor, s.valorCentavos);
    if (desc > 0) linhas.push({ salaId: s.salaId, valorCentavos: desc });
  }
  return linhas;
}
