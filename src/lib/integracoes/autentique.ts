import "server-only";

/**
 * Integração Autentique (CLAUDE.md §6.3) — assinatura digital (GraphQL).
 * Abstraída atrás de `ServicoAssinatura` para permitir mock em dev/testes.
 * Stub tipado — implementação real na Fase 4.
 */

export interface DocumentoAssinatura {
  id: string;
  status: "pendente" | "assinado" | "recusado";
  linkAssinatura: string;
  assinadoEm: string | null;
}

export interface ServicoAssinatura {
  criarDocumento(params: {
    nome: string;
    pdf: Buffer;
    signatarioEmail: string;
  }): Promise<DocumentoAssinatura>;
  consultarStatus(documentoId: string): Promise<DocumentoAssinatura>;
}

export function isAutentiqueConfigured(): boolean {
  return Boolean(process.env.AUTENTIQUE_API_TOKEN);
}

export const autentique: ServicoAssinatura = {
  async criarDocumento() {
    throw new Error("Autentique: não implementado (stub Fase 0).");
  },
  async consultarStatus() {
    throw new Error("Autentique: não implementado (stub Fase 0).");
  },
};
