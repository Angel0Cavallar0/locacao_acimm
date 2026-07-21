import { NextResponse } from "next/server";
import { autorizarCron } from "@/lib/cron/auth";
import { processarLembretes } from "@/lib/cron/lembretes";

/** Lembrete pré-evento (Spec 16 §4.2) — diário, 08:00 BRT. */
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!autorizarCron(req)) return new NextResponse(null, { status: 401 });
  const r = await processarLembretes();
  return NextResponse.json(r);
}
