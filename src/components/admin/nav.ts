import {
  CalendarDays,
  ClipboardList,
  Coffee,
  Contact,
  DollarSign,
  DoorOpen,
  FileText,
  LayoutDashboard,
  ListOrdered,
  type LucideIcon,
  Megaphone,
  Settings,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Só admin vê no menu (a visibilidade é cosmética; a página tem requireAdmin). */
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard },
  { href: "/admin/calendario", label: "Calendário", icon: CalendarDays },
  { href: "/admin/locacoes", label: "Locações", icon: ClipboardList },
  { href: "/admin/associados", label: "Associados", icon: Contact },
  { href: "/admin/salas", label: "Salas", icon: DoorOpen },
  { href: "/admin/eventos", label: "Eventos ACIMM", icon: Megaphone },
  { href: "/admin/coffee", label: "Coffee Break", icon: Coffee },
  { href: "/admin/contratos", label: "Contratos", icon: FileText },
  { href: "/admin/comissoes", label: "Comissões", icon: DollarSign },
  { href: "/admin/lista-espera", label: "Lista de Espera", icon: ListOrdered },
  {
    href: "/admin/configuracoes",
    label: "Configurações",
    icon: Settings,
    adminOnly: true,
  },
];

/** Item de navegação ativo para um dado pathname. */
export function itemAtivo(pathname: string, href: string): boolean {
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}
