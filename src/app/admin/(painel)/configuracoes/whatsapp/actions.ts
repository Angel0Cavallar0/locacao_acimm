"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import {
  conectarInstancia,
  desconectarInstancia,
  type EstadoConexaoWhatsapp,
  enviarWhatsappTexto,
  isEvolutionConfigured,
  obterEstadoInstancia,
  obterInfoInstancia,
  reiniciarInstancia,
} from "@/lib/integracoes/evolution";
import { normalizarTelefoneBR } from "@/lib/utils/telefone";

/**
 * Ações da conexão do WhatsApp (Spec 28). Admin only. Operações de configuração
 * — leem/alteram apenas o estado da sessão na instância, sem tocar no banco.
 * Nenhum texto ou retorno menciona ferramentas/stack.
 */

const NAO_CONFIGURADO =
  "WhatsApp não configurado — credenciais ausentes.";

/** Status atual da conexão (usado pelo polling do client). Nunca lança. */
export async function atualizarStatusWhatsappAction(): Promise<{
  estado: EstadoConexaoWhatsapp;
  numero: string | null;
  perfil: string | null;
}> {
  await requireAdmin();
  if (!isEvolutionConfigured()) {
    return { estado: "desconhecido", numero: null, perfil: null };
  }
  const [estado, info] = await Promise.all([
    obterEstadoInstancia(),
    obterInfoInstancia(),
  ]);
  return { estado, numero: info.numero, perfil: info.perfil };
}

/** Gera o QR code / código de pareamento para conectar um aparelho. */
export async function gerarQrWhatsappAction(): Promise<{
  base64?: string | null;
  pairingCode?: string | null;
  error?: string;
}> {
  await requireAdmin();
  if (!isEvolutionConfigured()) return { error: NAO_CONFIGURADO };
  try {
    const { base64, pairingCode } = await conectarInstancia();
    if (!base64 && !pairingCode) {
      return {
        error:
          "Nenhum código retornado. O número pode já estar conectado — atualize o status.",
      };
    }
    return { base64, pairingCode };
  } catch {
    return { error: "Não foi possível gerar o QR code. Tente novamente." };
  }
}

/** Encerra a sessão do número pareado (logout). */
export async function desconectarWhatsappAction(): Promise<{
  ok?: true;
  error?: string;
}> {
  await requireAdmin();
  if (!isEvolutionConfigured()) return { error: NAO_CONFIGURADO };
  try {
    await desconectarInstancia();
  } catch {
    return { error: "Não foi possível desconectar." };
  }
  revalidatePath("/admin/configuracoes/whatsapp");
  return { ok: true };
}

/** Reinicia a conexão sem deslogar o número. */
export async function reiniciarWhatsappAction(): Promise<{
  ok?: true;
  error?: string;
}> {
  await requireAdmin();
  if (!isEvolutionConfigured()) return { error: NAO_CONFIGURADO };
  try {
    await reiniciarInstancia();
  } catch {
    return { error: "Não foi possível reiniciar a conexão." };
  }
  revalidatePath("/admin/configuracoes/whatsapp");
  return { ok: true };
}

/** Envia um WhatsApp de teste ao número informado, validando o celular. */
export async function enviarTesteWhatsappAction(
  numeroBruto: string,
): Promise<{ ok?: true; error?: string }> {
  await requireAdmin();
  if (!isEvolutionConfigured()) return { error: NAO_CONFIGURADO };

  const norm = normalizarTelefoneBR(numeroBruto ?? "");
  if ("erro" in norm) return { error: norm.erro };

  try {
    await enviarWhatsappTexto(
      norm.numero,
      "✅ Mensagem de teste do Sistema de Locação de Salas da ACIMM. " +
        "Se você recebeu isto, a conexão do WhatsApp está funcionando.",
    );
  } catch {
    return {
      error:
        "Não foi possível enviar a mensagem de teste. Verifique a conexão e o número.",
    };
  }
  return { ok: true };
}
