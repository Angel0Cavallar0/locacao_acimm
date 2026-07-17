import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Layout das telas públicas de auth do painel (login/recuperar/definir senha).
 * Card centrado, sem sidebar e sem guard. Não faz fetch de dados (Spec 03 §7).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-surface-muted px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <Image
            src="/logo-acimm.png"
            alt="ACIMM"
            width={3405}
            height={1069}
            priority
            sizes="180px"
            className="h-auto w-full max-w-[180px]"
          />
          <span className="text-sm font-medium text-ink-muted">
            Painel do Colaborador
          </span>
        </div>

        {children}

        <div className="mt-6 text-center">
          <Link
            href="/"
            className="text-xs text-ink-muted underline-offset-4 hover:underline"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </main>
  );
}
