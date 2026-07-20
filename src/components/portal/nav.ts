import { CalendarSearch, ClipboardList, type LucideIcon, User } from "lucide-react";

export interface PortalNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const PORTAL_NAV: PortalNavItem[] = [
  { href: "/disponibilidade", label: "Disponibilidade", icon: CalendarSearch },
  { href: "/locacoes", label: "Minhas locações", icon: ClipboardList },
  { href: "/perfil", label: "Perfil", icon: User },
];

export function portalItemAtivo(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
