import { NextResponse } from "next/server";
import { autorizarCron } from "@/lib/cron/auth";
import { processarSymplaInscritos } from "@/lib/cron/sympla-inscritos";

/** Sync de inscritos do Sympla (Spec 17 §6) — hora em hora. */
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!autorizarCron(req)) return new NextResponse(null, { status: 401 });
  const r = await processarSymplaInscritos();
  return NextResponse.json(r);
}
