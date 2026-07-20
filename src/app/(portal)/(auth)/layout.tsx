import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Layout das telas públicas de auth do portal do associado
 * (login/cadastro/recuperar/definir senha). Card centrado, sem shell e sem
 * guard — as próprias páginas redirecionam quem já está autenticado.
 */
export default function PortalAuthLayout({ children }: { children: ReactNode }) {
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
            Locação de Salas
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
