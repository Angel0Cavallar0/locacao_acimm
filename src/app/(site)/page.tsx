import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/**
 * Tela inicial (`/`). Ponto de escolha entre os dois públicos.
 * Versão base do setup (Fase 0); o refino completo é o Spec 01.
 * A checagem de sessão (associado/colaborador) entra com o módulo de auth.
 */
export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12 text-center">
      <div className="flex w-full max-w-[360px] flex-col items-center gap-8">
        <Image
          src="/logo-acimm.png"
          alt="ACIMM"
          width={200}
          height={80}
          priority
          className="h-auto w-auto max-h-24"
        />

        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold text-ink">
            Sistema de Locação de Salas
          </h1>
          <p className="text-sm text-ink-muted">
            Reserve os ambientes da ACIMM de forma simples e acompanhe tudo
            online.
          </p>
        </div>

        <div className="flex w-full flex-col items-center gap-3">
          <Link
            href="/login"
            className={buttonVariants({ size: "lg", className: "w-full" })}
          >
            Locar sala
          </Link>
          <Link
            href="/admin/login"
            className={buttonVariants({ variant: "ghost", className: "w-full" })}
          >
            Acesso do colaborador
          </Link>
        </div>
      </div>

      <footer className="text-xs text-ink-muted">
        ACIMM — Associação Comercial e Empresarial de Mogi Mirim
      </footer>
    </div>
  );
}
