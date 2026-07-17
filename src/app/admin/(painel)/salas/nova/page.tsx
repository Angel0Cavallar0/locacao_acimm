import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { requireColaborador } from "@/lib/auth/guards";
import { SalaForm } from "../sala-form";

export const metadata: Metadata = { title: "Nova sala" };

export default async function NovaSalaPage() {
  await requireColaborador();
  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/admin/salas"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <ArrowLeft className="size-4" />
        Salas
      </Link>
      <h2 className="mt-2 mb-4 font-display text-lg font-semibold text-ink">
        Nova sala
      </h2>
      <SalaForm modo="criar" />
    </div>
  );
}
