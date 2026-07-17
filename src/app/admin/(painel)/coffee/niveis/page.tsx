import type { Metadata } from "next";
import Link from "next/link";
import { requireColaborador } from "@/lib/auth/guards";
import { listarNiveis } from "@/lib/coffee/dados";
import { NiveisClient } from "./niveis-client";

export const metadata: Metadata = { title: "Níveis de coffee" };

export default async function NiveisCoffeePage() {
  await requireColaborador();
  const niveis = await listarNiveis();

  return (
    <div>
      <Link
        href="/admin/coffee"
        className="mx-auto mb-3 block max-w-3xl text-sm text-ink-muted hover:text-ink"
      >
        ← Coffee break
      </Link>
      <NiveisClient niveis={niveis} />
    </div>
  );
}
