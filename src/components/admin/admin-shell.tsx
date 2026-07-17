"use client";

import { ChevronDown, KeyRound, LogOut, Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useState } from "react";
import { signOutColaborador } from "@/app/admin/(painel)/actions";
import { type NavItem, NAV_ITEMS, itemAtivo } from "@/components/admin/nav";
import { cn } from "@/lib/utils";

function NavLista({
  itens,
  pathname,
  onNavegar,
}: {
  itens: NavItem[];
  pathname: string;
  onNavegar?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-0.5 p-3">
      {itens.map((item) => {
        const ativo = itemAtivo(pathname, item.href);
        const Icone = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavegar}
            aria-current={ativo ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              ativo
                ? "bg-brand text-brand-foreground"
                : "text-ink-muted hover:bg-surface-muted hover:text-ink",
            )}
          >
            <Icone className="size-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarConteudo({
  itens,
  pathname,
  onNavegar,
}: {
  itens: NavItem[];
  pathname: string;
  onNavegar?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-4 py-4">
        <Image
          src="/logo-acimm.png"
          alt="ACIMM"
          width={3405}
          height={1069}
          className="h-7 w-auto"
        />
        <span className="text-xs font-medium text-ink-muted">
          Locação de Salas
        </span>
      </div>
      <NavLista itens={itens} pathname={pathname} onNavegar={onNavegar} />
    </div>
  );
}

function UserMenu({ nome }: { nome: string }) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span className="max-w-[10rem] truncate font-medium text-ink">
          {nome}
        </span>
        <ChevronDown className="size-4 text-ink-muted transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 z-50 mt-2 w-48 rounded-md border bg-popover p-1 shadow-md">
        <Link
          href="/admin/definir-senha"
          className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-ink hover:bg-surface-muted"
        >
          <KeyRound className="size-4" />
          Trocar senha
        </Link>
        <form action={signOutColaborador}>
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

export function AdminShell({
  nome,
  role,
  children,
}: {
  nome: string;
  role: "admin" | "colaborador";
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [drawerAberto, setDrawerAberto] = useState(false);

  const itens = NAV_ITEMS.filter((i) => !i.adminOnly || role === "admin");
  const tituloAtual =
    itens.find((i) => itemAtivo(pathname, i.href))?.label ?? "Painel";

  // Fecha o drawer ao navegar.
  useEffect(() => {
    setDrawerAberto(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-surface">
      {/* Sidebar desktop */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r bg-surface md:block">
        <SidebarConteudo itens={itens} pathname={pathname} />
      </aside>

      {/* Drawer mobile */}
      {drawerAberto ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Fechar menu"
            className="absolute inset-0 bg-black/40"
            onClick={() => setDrawerAberto(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-64 bg-surface shadow-xl">
            <button
              type="button"
              aria-label="Fechar menu"
              onClick={() => setDrawerAberto(false)}
              className="absolute top-3 right-3 rounded-md p-1 text-ink-muted hover:bg-surface-muted"
            >
              <X className="size-5" />
            </button>
            <SidebarConteudo
              itens={itens}
              pathname={pathname}
              onNavegar={() => setDrawerAberto(false)}
            />
          </aside>
        </div>
      ) : null}

      {/* Área principal */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-surface/95 px-4 backdrop-blur supports-backdrop-filter:bg-surface/80">
          <button
            type="button"
            aria-label="Abrir menu"
            onClick={() => setDrawerAberto(true)}
            className="rounded-md p-1.5 text-ink-muted hover:bg-surface-muted md:hidden"
          >
            <Menu className="size-5" />
          </button>
          <h1 className="flex-1 truncate font-display text-base font-semibold text-ink">
            {tituloAtual}
          </h1>
          <UserMenu nome={nome} />
        </header>

        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
