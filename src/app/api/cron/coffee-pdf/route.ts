import { NextResponse } from "next/server";
import { processarCoffeePdf } from "@/lib/cron/coffee-pdf";
import { autorizarCron } from "@/lib/cron/auth";

/** PDF semanal de compras do coffee (Spec 16 §4.3) — segunda, 07:00 BRT. */
export const maxDuration = 60;

export async function POST(req: Request) {
  if (!autorizarCron(req)) return new NextResponse(null, { status: 401 });
  const r = await processarCoffeePdf();
  return NextResponse.json(r);
}
