"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { rotuloLocacao } from "@/lib/locacoes/tipos";
import { excluirLocacaoAction } from "./exclusao-actions";

/**
 * Zona de risco (só admin — ver `requireAdmin` na action): exclusão física
 * definitiva, diferente de cancelar. Exige digitar o número da locação para
 * habilitar o confirmar, e motivo obrigatório.
 */
export function ExclusaoLocacao({
  locacaoId,
  numero,
}: {
  locacaoId: string;
  numero: number;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [motivo, setMotivo] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  const rotulo = rotuloLocacao(numero);
  const podeConfirmar =
    confirmacao.trim() === rotulo && motivo.trim().length > 0;

  async function confirmar() {
    setExcluindo(true);
    const r = await excluirLocacaoAction({ locacaoId, motivo: motivo.trim() });
    setExcluindo(false);
    if ("erro" in r) {
      toast.error(r.erro);
      return;
    }
    toast.success("Locação excluída definitivamente.");
    router.push("/admin/locacoes");
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-sm font-semibold text-destructive">Zona de risco</p>
      <p className="text-xs text-ink-muted">
        Exclui a locação e tudo que depende dela (coffee, adicionais,
        contrato, pagamentos, comissões, linha do tempo) para sempre. Use só
        para lançamentos incorretos ou duplicados — para um evento que não vai
        mais acontecer, prefira cancelar.
      </p>
      <Button
        variant="destructive"
        size="sm"
        className="self-start"
        onClick={() => setAberto(true)}
      >
        <Trash2 className="size-4" />
        Excluir locação definitivamente
      </Button>

      <Dialog
        open={aberto}
        onOpenChange={(o) => {
          setAberto(o);
          if (!o) {
            setConfirmacao("");
            setMotivo("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Excluir {rotulo} definitivamente?</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              Isso apaga a locação, coffee, adicionais, contrato, pagamentos,
              comissões e a linha do tempo — sem volta. Um registro mínimo
              (número, data, valor, quem excluiu) fica guardado à parte para
              auditoria.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="excluir-motivo">Motivo (obrigatório)</Label>
              <textarea
                id="excluir-motivo"
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                className="min-h-20 rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder="Explique por que esta locação está sendo excluída."
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="excluir-confirmacao">
                Digite <span className="font-mono font-semibold">{rotulo}</span>{" "}
                para confirmar
              </Label>
              <input
                id="excluir-confirmacao"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                className="h-9 rounded-lg border border-input bg-transparent px-2.5 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder={rotulo}
                autoComplete="off"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancelar
            </DialogClose>
            <Button
              variant="destructive"
              disabled={!podeConfirmar}
              loading={excluindo}
              onClick={confirmar}
            >
              Excluir definitivamente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
