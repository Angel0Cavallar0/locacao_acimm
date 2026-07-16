import { NextResponse } from "next/server";

/**
 * Callback fixo do OAuth do Google Calendar (CLAUDE.md §6.4).
 * Rota registrada como *Authorized redirect URI* no GCP:
 *   - dev:  http://localhost:3000/api/google/callback
 *   - prod: https://<dominio>/api/google/callback
 *
 * Stub até as credenciais do GCP chegarem (pendência §12). Retorna 501
 * para deixar claro que a feature está atrás de flag e ainda não ativa.
 */
export function GET() {
  return NextResponse.json(
    { error: "Integração Google Calendar ainda não configurada." },
    { status: 501 },
  );
}
