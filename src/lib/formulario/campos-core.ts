/**
 * Núcleo PURO do editor de formulário (Spec 22). Sem I/O. Duas responsabilidades
 * críticas:
 *  - validar/limpar as respostas no submit a partir dos campos ATIVOS (§4);
 *  - resolver as respostas para exibição pelo RÓTULO ATUAL, chaveadas por ID (§3).
 * As respostas são SEMPRE chaveadas pelo `id` do campo (nunca pelo rótulo), então
 * renomear um campo muda a exibição sem tocar nos dados.
 */

export type TipoCampo =
  | "texto"
  | "texto_longo"
  | "numero"
  | "selecao"
  | "multiselecao"
  | "booleano"
  | "data";

export const TIPOS_CAMPO: TipoCampo[] = [
  "texto",
  "texto_longo",
  "numero",
  "selecao",
  "multiselecao",
  "booleano",
  "data",
];

export const TIPO_ROTULO: Record<TipoCampo, string> = {
  texto: "Texto",
  texto_longo: "Texto longo",
  numero: "Número",
  selecao: "Seleção",
  multiselecao: "Multiseleção",
  booleano: "Sim/Não",
  data: "Data",
};

export interface CampoDef {
  id: string;
  rotulo: string;
  tipo: TipoCampo;
  opcoes: string[];
  obrigatorio: boolean;
}

/** Valor de uma resposta no transporte/estado do form e no jsonb. */
export type RespostaValor = string | number | boolean | string[];

/** Seleção/multiseleção exigem lista de opções (mín. 2 na criação/edição). */
export function exigeOpcoes(tipo: TipoCampo): boolean {
  return tipo === "selecao" || tipo === "multiselecao";
}

/** Normaliza opções digitadas: trim, remove vazias e duplicatas (ordem mantida). */
export function normalizarOpcoes(opcoes: string[]): string[] {
  const vistos = new Set<string>();
  const saida: string[] = [];
  for (const o of opcoes) {
    const t = o.trim();
    if (t && !vistos.has(t)) {
      vistos.add(t);
      saida.push(t);
    }
  }
  return saida;
}

/** Resposta "vazia" para efeito de obrigatoriedade. Booleano nunca é vazio. */
export function respostaVazia(tipo: TipoCampo, valor: unknown): boolean {
  if (tipo === "booleano") return false;
  if (tipo === "multiselecao") return !Array.isArray(valor) || valor.length === 0;
  return valor === undefined || valor === null || String(valor).trim() === "";
}

function coagir(
  campo: CampoDef,
  bruto: unknown,
): { valor: RespostaValor } | { erro: string } {
  switch (campo.tipo) {
    case "texto":
    case "texto_longo":
      return { valor: String(bruto).trim() };
    case "numero": {
      const n =
        typeof bruto === "number"
          ? bruto
          : Number.parseFloat(String(bruto).replace(",", "."));
      if (!Number.isFinite(n)) {
        return { erro: `${campo.rotulo}: informe um número válido.` };
      }
      return { valor: n };
    }
    case "data": {
      const s = String(bruto).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return { erro: `${campo.rotulo}: data inválida.` };
      }
      return { valor: s };
    }
    case "selecao": {
      const s = String(bruto);
      if (!campo.opcoes.includes(s)) {
        return { erro: `${campo.rotulo}: opção inválida.` };
      }
      return { valor: s };
    }
    case "multiselecao": {
      if (!Array.isArray(bruto)) {
        return { erro: `${campo.rotulo}: seleção inválida.` };
      }
      const arr = [...new Set(bruto.map(String))];
      for (const v of arr) {
        if (!campo.opcoes.includes(v)) {
          return { erro: `${campo.rotulo}: opção inválida.` };
        }
      }
      return { valor: arr };
    }
    case "booleano":
      return { valor: bruto === true || bruto === "true" };
    default:
      return { erro: `${campo.rotulo}: tipo não suportado.` };
  }
}

export type ResultadoValidacao =
  | { ok: true; valores: Record<string, RespostaValor> }
  | { ok: false; erro: string };

/**
 * Valida e LIMPA as respostas contra os campos ativos vigentes (§4): tipo
 * correto, obrigatórios presentes, opções ∈ vigentes. Chaves desconhecidas/
 * inativas são descartadas (não copiadas — payload adulterado nunca é gravado).
 * Vazio não-obrigatório não é gravado (sem lixo).
 */
export function validarRespostas(
  campos: CampoDef[],
  brutas: Record<string, unknown>,
): ResultadoValidacao {
  const valores: Record<string, RespostaValor> = {};
  for (const campo of campos) {
    const bruto = brutas[campo.id];
    if (respostaVazia(campo.tipo, bruto)) {
      if (campo.obrigatorio) {
        return { ok: false, erro: `Responda: ${campo.rotulo}.` };
      }
      continue;
    }
    const r = coagir(campo, bruto);
    if ("erro" in r) return { ok: false, erro: r.erro };
    valores[campo.id] = r.valor;
  }
  return { ok: true, valores };
}

/** Formata uma resposta para exibição (Sim/Não, lista, data BR). */
export function formatarResposta(
  tipo: TipoCampo | undefined,
  valor: unknown,
): string {
  if (Array.isArray(valor)) return valor.map(String).join(", ");
  if (tipo === "booleano" || typeof valor === "boolean") {
    return valor === true || valor === "true" ? "Sim" : "Não";
  }
  if (tipo === "data") {
    const s = String(valor);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").reverse().join("/") : s;
  }
  return String(valor ?? "");
}

export interface RespostaExibicao {
  id: string;
  rotulo: string;
  valor: string;
}

/**
 * Resolve as respostas gravadas (chaveadas por id) para exibição, usando o
 * rótulo ATUAL do campo. Ordena pela ordem dos campos; campos já removidos
 * (não deveria haver — sem hard delete) caem como "Campo removido" no fim.
 */
export function resolverRespostasFormulario(
  campos: CampoDef[],
  respostas: Record<string, unknown>,
): RespostaExibicao[] {
  const mapa = new Map(campos.map((c) => [c.id, c]));
  const ordem = new Map(campos.map((c, i) => [c.id, i]));
  const saida: RespostaExibicao[] = Object.entries(respostas).map(
    ([id, valor]) => {
      const campo = mapa.get(id);
      return {
        id,
        rotulo: campo?.rotulo ?? "Campo removido",
        valor: formatarResposta(campo?.tipo, valor),
      };
    },
  );
  saida.sort(
    (a, b) => (ordem.get(a.id) ?? 9999) - (ordem.get(b.id) ?? 9999),
  );
  return saida;
}
