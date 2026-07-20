"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { cancelarSolicitacao } from "./actions";

export function CancelarDialog({ locacaoId }: { locacaoId: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function cancelar() {
    setEnviando(true);
    const r = await cancelarSolicitacao({ locacaoId, motivo });
    setEnviando(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success("Solicitação cancelada.");
    setAberto(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" onClick={() => setAberto(true)}>
        Cancelar solicitação
      </Button>
      {aberto ? (
        <Dialog open onOpenChange={(o) => !o && setAberto(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancelar solicitação</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-ink-muted">
              Você pode cancelar enquanto a solicitação ainda não foi aprovada.
              Esta ação não pode ser desfeita.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="motivo-cancelar">Motivo (opcional)</Label>
              <textarea
                id="motivo-cancelar"
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="min-h-16 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder="Conta pra gente por que está cancelando…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAberto(false)}>
                Voltar
              </Button>
              <Button
                variant="destructive"
                loading={enviando}
                onClick={cancelar}
              >
                Cancelar solicitação
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
