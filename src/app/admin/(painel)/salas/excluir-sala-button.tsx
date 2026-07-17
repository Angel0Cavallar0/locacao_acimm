"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { excluirSala } from "./actions";

export function ExcluirSalaButton({
  salaId,
  nome,
}: {
  salaId: string;
  nome: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [texto, setTexto] = useState("");
  const [excluindo, setExcluindo] = useState(false);

  const confere = texto.trim() === nome.trim();

  async function excluir() {
    if (!confere) return;
    setExcluindo(true);
    const r = await excluirSala(salaId, texto.trim());
    if (r.error) {
      toast.error(r.error);
      setExcluindo(false);
      return;
    }
    toast.success("Sala excluída.");
    router.push("/admin/salas");
  }

  return (
    <Card className="border-destructive/30">
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 className="text-sm font-semibold text-ink">Excluir sala</h4>
          <p className="text-xs text-ink-muted">
            Remove a sala da tela. Locações e registros vinculados são
            preservados.
          </p>
        </div>
        <Button
          variant="destructive"
          onClick={() => {
            setTexto("");
            setOpen(true);
          }}
        >
          <Trash2 className="size-4" />
          Excluir sala
        </Button>
      </CardContent>

      <AlertDialog
        open={open}
        onOpenChange={(aberto) => {
          setOpen(aberto);
          if (!aberto) setTexto("");
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{nome}”?</AlertDialogTitle>
            <AlertDialogDescription>
              A sala será removida da tela. Nenhuma locação, contrato ou registro
              vinculado é apagado. Para confirmar, digite o nome exato da sala.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirma-nome">
              Digite <span className="font-medium text-ink">{nome}</span> para
              confirmar
            </Label>
            <Input
              id="confirma-nome"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              placeholder={nome}
              autoComplete="off"
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!confere || excluindo}
              onClick={excluir}
            >
              {excluindo ? "Excluindo…" : "Excluir sala"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
