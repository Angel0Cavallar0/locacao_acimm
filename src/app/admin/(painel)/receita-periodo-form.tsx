"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";

/**
 * Filtro de período da receita (Spec 32 §1.1) usando o DatePicker do shadcn.
 * "Aplicar" navega para `/admin?rde=&rate=` — a página recarrega server-side.
 */
export function ReceitaPeriodoForm({
  deInicial,
  ateInicial,
}: {
  deInicial: string;
  ateInicial: string;
}) {
  const router = useRouter();
  const [de, setDe] = useState(deInicial);
  const [ate, setAte] = useState(ateInicial);

  function aplicar() {
    const params = new URLSearchParams();
    if (de) params.set("rde", de);
    if (ate) params.set("rate", ate);
    const qs = params.toString();
    router.push(qs ? `/admin?${qs}` : "/admin");
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex w-40 flex-col gap-1">
        <span className="text-xs text-ink-muted">De</span>
        <DatePicker
          value={de}
          onChange={setDe}
          dataMax={ate || undefined}
          placeholder="Início"
        />
      </div>
      <div className="flex w-40 flex-col gap-1">
        <span className="text-xs text-ink-muted">Até</span>
        <DatePicker
          value={ate}
          onChange={setAte}
          dataMin={de || undefined}
          placeholder="Fim"
        />
      </div>
      <Button type="button" size="sm" variant="outline" onClick={aplicar}>
        Aplicar
      </Button>
    </div>
  );
}
