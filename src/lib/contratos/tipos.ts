import type { AdicionalCoffee } from "@/lib/coffee/tipos";
import type { PeriodoDia } from "@/lib/dominio";
import type { FormaPagamento } from "@/lib/locacoes/tipos";

/** Tipos e parsers dos textos do contrato (Spec 13). Puros — sem server-only. */

export interface ClausulaContrato {
  titulo: string;
  texto: string;
}

export interface ContratoTextos {
  locadora: string;
  clausulas: ClausulaContrato[];
  consideracoesFinais: string[];
  termoResponsabilidade: string;
}

export interface DadosPagamento {
  banco: string;
  codigoBanco: string;
  agencia: string;
  conta: string;
  pix: string;
}

export const TEXTOS_PADRAO: ContratoTextos = {
  locadora: "ASSOCIAÇÃO COMERCIAL E INDUSTRIAL DE MOGI MIRIM – ACIMM.",
  clausulas: [],
  consideracoesFinais: [],
  termoResponsabilidade: "",
};

export const DADOS_PAGAMENTO_PADRAO: DadosPagamento = {
  banco: "",
  codigoBanco: "",
  agencia: "",
  conta: "",
  pix: "",
};

/** Aceita o jsonb de `configuracoes.contrato_textos` (snake ou camelCase). */
export function parsearTextos(raw: unknown): ContratoTextos {
  const o = (raw ?? {}) as Record<string, unknown>;
  const clausulas = Array.isArray(o.clausulas)
    ? o.clausulas
        .map((c) => {
          const cc = (c ?? {}) as Record<string, unknown>;
          return {
            titulo: String(cc.titulo ?? "").trim(),
            texto: String(cc.texto ?? "").trim(),
          };
        })
        .filter((c) => c.texto !== "")
    : [];
  const finaisRaw = o.consideracoes_finais ?? o.consideracoesFinais;
  const consideracoesFinais = Array.isArray(finaisRaw)
    ? finaisRaw.map((x) => String(x).trim()).filter(Boolean)
    : [];
  return {
    locadora: String(o.locadora ?? TEXTOS_PADRAO.locadora),
    clausulas,
    consideracoesFinais,
    termoResponsabilidade: String(
      o.termo_responsabilidade ?? o.termoResponsabilidade ?? "",
    ),
  };
}

/** Aceita o jsonb de `configuracoes.dados_pagamento`. */
export function parsearDadosPagamento(raw: unknown): DadosPagamento {
  const o = (raw ?? {}) as Record<string, unknown>;
  return {
    banco: String(o.banco ?? ""),
    codigoBanco: String(o.codigo_banco ?? o.codigoBanco ?? ""),
    agencia: String(o.agencia ?? ""),
    conta: String(o.conta ?? ""),
    pix: String(o.pix ?? ""),
  };
}

/** Modo de envio do contrato (`configuracoes.modo_envio_contrato`). */
export type ModoEnvioContrato = "email" | "autentique";

export function parsearModoEnvio(raw: unknown): ModoEnvioContrato {
  return raw === "autentique" ? "autentique" : "email";
}

/** Dados prontos para o template do PDF (Spec 13 §2). */
export interface DadosContrato {
  numero: number;
  locatarioNome: string;
  locatarioDocumento: string;
  locatarioEmail: string;
  locatarioTelefone: string;
  responsavelNome: string;
  /** true quando não havia responsável e usamos o nome do locatário (§1). */
  responsavelFallback: boolean;
  associadoId: string | null;
  periodoRotulo: string;
  horaInicio: string;
  horaFim: string;
  dataEventoExtenso: string;
  dataEventoCurta: string;
  qtdPessoas: number;
  tipoEvento: string | null;
  salas: { nome: string; equipamentos: string[] }[];
  coffee: {
    nivelNome: string;
    qtdPessoas: number;
    faixaRotulo: string | null;
    valorPessoaCentavos: number;
    adicionais: AdicionalCoffee[];
    valorCentavos: number;
  } | null;
  adicionais: {
    descricao: string;
    quantidade: number;
    valorUnitarioCentavos: number;
  }[];
  valorSalasCentavos: number;
  valorCoffeeCentavos: number;
  valorAdicionaisCentavos: number;
  valorDescontosCentavos: number;
  valorTotalCentavos: number;
  formaPagamento: FormaPagamento | null;
  periodo: PeriodoDia | null;
  textos: ContratoTextos;
  dadosPagamento: DadosPagamento;
  /** Data de geração (dd de mês por extenso de aaaa). */
  dataGeracaoExtenso: string;
}
