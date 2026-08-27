import {
  CalendarDays,
  CalendarOff,
  ClipboardList,
  Coffee,
  Contact,
  DollarSign,
  DoorOpen,
  FileSpreadsheet,
  FileText,
  FormInput,
  LayoutDashboard,
  ListOrdered,
  type LucideIcon,
  Megaphone,
  PlusSquare,
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
  { href: "/admin/lista-espera", label: "Pendentes", icon: ListOrdered },
  { href: "/admin/pendencias", label: "Sem data", icon: CalendarOff },
  { href: "/admin/cotacoes", label: "Cotações", icon: FileSpreadsheet },
  {
    href: "/admin/configuracoes/servicos",
    label: "Serviços adicionais",
    icon: PlusSquare,
  },
  {
    href: "/admin/configuracoes/formulario",
    label: "Formulário",
    icon: FormInput,
  },
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

/**
 * href do item MAIS específico (prefixo mais longo) que casa com o pathname —
 * evita que o pai (`/admin/configuracoes`) acenda junto com o filho
 * (`/admin/configuracoes/formulario`), que tem item próprio no menu.
 */
export function hrefAtivo(pathname: string, hrefs: string[]): string | null {
  let melhor: string | null = null;
  for (const href of hrefs) {
    if (!itemAtivo(pathname, href)) continue;
    if (melhor === null || href.length > melhor.length) melhor = href;
  }
  return melhor;
}
