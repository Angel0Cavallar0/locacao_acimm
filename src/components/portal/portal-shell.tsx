"use client";

import { ChevronDown, KeyRound, LogOut } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { signOutAssociado } from "@/app/(portal)/actions";
import { PORTAL_NAV, portalItemAtivo } from "@/components/portal/nav";
import { cn } from "@/lib/utils";

function UserMenu({ nome }: { nome: string }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="max-w-[9rem] truncate font-medium text-ink">{nome}</span>
        <ChevronDown className="size-4 text-ink-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-48 rounded-md border bg-popover p-1 shadow-md">
        <Link
          href="/definir-senha"
          className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-ink hover:bg-surface-muted"
        >
          <KeyRound className="size-4" />
          Trocar senha
        </Link>
        <form action={signOutAssociado}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-ink hover:bg-surface-muted"
          >
            <LogOut className="size-4" />
            Sair
          </button>
        </form>
      </div>
    </details>
  );
}

export function PortalShell({
  nome,
  children,
}: {
  nome: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-surface/95 px-4 backdrop-blur supports-backdrop-filter:bg-surface/80">
        <Link href="/disponibilidade" className="flex items-center gap-2">
          <Image
            src="/logo-acimm.png"
            alt="ACIMM"
            width={3405}
            height={1069}
            className="h-7 w-auto"
          />
          <span className="hidden text-xs font-medium text-ink-muted sm:inline">
            Locação de Salas
          </span>
        </Link>

        {/* Nav desktop */}
        <nav className="ml-4 hidden flex-1 items-center gap-1 md:flex">
          {PORTAL_NAV.map((item) => {
            const ativo = portalItemAtivo(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  ativo
                    ? "bg-brand text-brand-foreground"
                    : "text-ink-muted hover:bg-surface-muted hover:text-ink",
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto md:ml-0">
          <UserMenu nome={nome} />
        </div>
      </header>

      <main className="flex-1 p-4 pb-24 md:p-6 md:pb-6">{children}</main>

      {/* Bottom nav mobile */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t bg-surface/95 backdrop-blur supports-backdrop-filter:bg-surface/80 md:hidden">
        {PORTAL_NAV.map((item) => {
          const ativo = portalItemAtivo(pathname, item.href);
          const Icone = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 py-2 text-xs font-medium",
                ativo ? "text-brand" : "text-ink-muted",
              )}
            >
              <Icone className="size-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
