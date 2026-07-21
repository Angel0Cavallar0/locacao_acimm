import { NextResponse } from "next/server";
import { autorizarCron } from "@/lib/cron/auth";
import { processarNotificacoes } from "@/lib/notificacoes/processar";

/** Retry da fila de notificações (Spec 16 §4.1) — a cada 15min. */
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!autorizarCron(req)) return new NextResponse(null, { status: 401 });
  const r = await processarNotificacoes(50);
  return NextResponse.json({ processados: r.processadas, falhas: r.falhas });
}
