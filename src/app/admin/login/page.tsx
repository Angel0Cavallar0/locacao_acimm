import type { Metadata } from "next";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Painel — Entrar",
};

/**
 * Stub de login do colaborador (§5.1). Implementação real no módulo de auth.
 * Existe para os botões da tela inicial não retornarem 404.
 */
export default function AdminLoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <div className="max-w-sm space-y-3">
        <h1 className="font-display text-xl font-semibold text-ink">
          Acesso do colaborador
        </h1>
        <p className="text-sm text-ink-muted">
          Em construção — o login por e-mail e senha entra em breve.
        </p>
      </div>
      <Link href="/" className={buttonVariants({ variant: "ghost" })}>
        Voltar ao início
      </Link>
    </div>
  );
}
