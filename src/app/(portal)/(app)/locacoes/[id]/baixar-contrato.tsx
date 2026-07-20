"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { urlContrato } from "./actions";

export function BaixarContrato({ locacaoId }: { locacaoId: string }) {
  const [abrindo, setAbrindo] = useState(false);

  async function baixar() {
    setAbrindo(true);
    const r = await urlContrato(locacaoId);
    setAbrindo(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    window.open(r.url, "_blank", "noopener,noreferrer");
  }

  return (
    <Button variant="outline" size="sm" loading={abrindo} onClick={baixar}>
      <Download className="size-4" />
      Baixar contrato assinado
    </Button>
  );
}
