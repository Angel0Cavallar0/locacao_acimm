"use client";

import { ChevronDown } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * Card de configuração colapsável: o conteúdo (form/lista) fica oculto até o
 * colaborador expandir. A seta para baixo indica "expandir"; ao abrir ela gira.
 */
export function CardColapsavel({
  icon,
  titulo,
  descricao,
  children,
  iniciaAberto = false,
}: {
  icon: ReactNode;
  titulo: string;
  descricao: string;
  children: ReactNode;
  iniciaAberto?: boolean;
}) {
  const [aberto, setAberto] = useState(iniciaAberto);

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className="flex items-center gap-3 text-left"
        >
          <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-brand/10 text-brand">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-medium text-ink">{titulo}</h3>
            <p className="text-xs text-ink-muted">{descricao}</p>
          </div>
          <ChevronDown
            className={cn(
              "size-5 shrink-0 text-ink-muted transition-transform",
              aberto && "rotate-180",
            )}
          />
        </button>
        {aberto ? children : null}
      </CardContent>
    </Card>
  );
}
