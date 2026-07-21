"use client";

import { Ban } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cancelarEventoAction } from "../actions";

/** Cancelar evento (não deleta; libera a agenda via trigger). */
export function EventoAcoes({
  eventoId,
  temSympla,
}: {
  eventoId: string;
  temSympla: boolean;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pendente, setPendente] = useState(false);

  async function cancelar() {
    setPendente(true);
    const r = await cancelarEventoAction(eventoId);
    setPendente(false);
    if (r.error) return toast.error(r.error);
    toast.success("Evento cancelado.");
    router.refresh();
  }

  if (!confirmando) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setConfirmando(true)}
      >
        <Ban className="size-4" />
        Cancelar evento
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-sm text-ink">Cancelar este evento e liberar a agenda?</p>
      {temSympla ? (
        <p className="text-xs text-ink-muted">
          O cancelamento no Sympla, se houver, é manual na plataforma deles.
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button variant="destructive" size="sm" loading={pendente} onClick={cancelar}>
          Sim, cancelar
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={pendente}
          onClick={() => setConfirmando(false)}
        >
          Voltar
        </Button>
      </div>
    </div>
  );
}
