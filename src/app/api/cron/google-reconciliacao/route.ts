import { NextResponse } from "next/server";
import { autorizarCron } from "@/lib/cron/auth";
import { processarReconciliacaoGoogle } from "@/lib/google/reconciliacao";

/** Reconciliação do espelho Google (Spec 18 §4) — a cada 15 min. */
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!autorizarCron(req)) return new NextResponse(null, { status: 401 });
  const r = await processarReconciliacaoGoogle();
  return NextResponse.json(r);
}
