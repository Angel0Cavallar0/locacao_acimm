import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { obterEstadoSessao } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Sistema de Locação de Salas",
  description:
    "Reserve os ambientes da ACIMM de forma simples e acompanhe tudo online.",
  openGraph: {
    title: "Sistema de Locação de Salas | ACIMM",
    description:
      "Reserve os ambientes da ACIMM de forma simples e acompanhe tudo online.",
    images: [{ url: "/logo-acimm.png", width: 3405, height: 1069, alt: "ACIMM" }],
    locale: "pt_BR",
    type: "website",
  },
};

/**
 * Tela inicial (`/`) — ponto de escolha entre os dois públicos (Spec 01).
 * Server Component: a sessão é verificada UMA vez no servidor (sem flash).
 * Não redireciona ninguém automaticamente — a página é escolha, não gate.
 */
export default async function HomePage() {
  const sessao = await obterEstadoSessao();

  const primario =
    sessao === "associado"
      ? { href: "/disponibilidade", label: "Ver disponibilidade" }
      : { href: "/login", label: "Locar Sala/Acesso Associados" };

  const secundario =
    sessao === "colaborador"
      ? { href: "/admin", label: "Ir para o painel" }
      : { href: "/admin/login", label: "Acesso do colaborador" };

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_70%_55%_at_50%_-10%,var(--brand-muted),var(--surface))] px-6 py-10">
      <div className="animate-entrada flex w-full max-w-[360px] flex-col items-center gap-9 text-center">
        <Image
          src="/logo-acimm.png"
          alt="ACIMM"
          width={3405}
          height={1069}
          priority
          sizes="240px"
          className="h-auto w-full max-w-[240px]"
        />

        <div className="space-y-2">
          <h1 className="font-display text-2xl font-semibold text-balance text-ink">
            Sistema de Locação de Salas
          </h1>
          <p className="text-sm text-pretty text-ink-muted">
            Reserve os ambientes da ACIMM de forma simples e acompanhe tudo
            online.
          </p>
        </div>

        <nav className="flex w-full flex-col items-center gap-2.5">
          <Link
            href={primario.href}
            className={cn(
              buttonVariants({ size: "lg" }),
              "h-12 w-full text-base",
            )}
          >
            {primario.label}
          </Link>
          <Link
            href={secundario.href}
            className={cn(
              buttonVariants({ variant: "ghost" }),
              "h-11 w-full text-ink-muted",
            )}
          >
            {secundario.label}
          </Link>
        </nav>
      </div>

      <footer className="absolute inset-x-0 bottom-4 px-6 text-center text-xs text-ink-muted">
        ACIMM — Associação Comercial e Empresarial de Mogi Mirim | Desenvolvido por{" "}
        <Link href="https://www.facioflow.com.br" className="text-ink hover:text-ink-hover">
          FacioFlow
        </Link>
      </footer>
    </div>
  );
}
