import { NextResponse } from "next/server";
import { salvarConexao } from "@/lib/google/conexao";
import { validarState } from "@/lib/google/state";
import {
  isGoogleConfigured,
  obterEmailConta,
  trocarCodigoPorTokens,
} from "@/lib/integracoes/google";

/**
 * Callback fixo do OAuth do Google Calendar (CLAUDE.md §6.4, Spec 18 §3).
 * Registrado como *Authorized redirect URI* no GCP (localhost, vercel.app,
 * domínio final). Valida o `state` assinado (CSRF), troca o `code` por tokens,
 * cifra o refresh token e grava a conexão singleton. Redireciona à tela de
 * integrações com o resultado. Sem envs Google → segue como não configurado.
 */

const DESTINO = "/admin/configuracoes/integracoes";

function redir(req: Request, status: string): NextResponse {
  const url = new URL(DESTINO, new URL(req.url).origin);
  url.searchParams.set("google", status);
  return NextResponse.redirect(url);
}

export async function GET(req: Request) {
  if (!isGoogleConfigured()) return redir(req, "indisponivel");

  const params = new URL(req.url).searchParams;

  // Usuário negou o consentimento ou o Google devolveu erro.
  if (params.get("error")) return redir(req, "negado");

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return redir(req, "state");

  // CSRF: state ausente/adulterado/expirado é rejeitado.
  const userId = validarState(state);
  if (!userId) return redir(req, "state");

  try {
    const tokens = await trocarCodigoPorTokens(code);
    const contaEmail = await obterEmailConta(tokens.accessToken);
    await salvarConexao({
      contaEmail,
      refreshToken: tokens.refreshToken,
      conectadoPor: userId,
    });
    return redir(req, "ok");
  } catch {
    return redir(req, "erro");
  }
}
