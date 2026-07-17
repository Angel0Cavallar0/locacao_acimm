"use client";

import { UserPlus } from "lucide-react";
import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  convidarColaborador,
  definirAtivoColaborador,
  definirRoleColaborador,
  type EstadoConvite,
} from "./actions";

interface ColaboradorRow {
  id: string;
  user_id: string;
  nome: string;
  email: string;
  role: "admin" | "colaborador";
  ativo: boolean;
  criado_em: string;
}

const selectClasses =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

function ConviteDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<EstadoConvite, FormData>(
    convidarColaborador,
    {},
  );

  useEffect(() => {
    if (state.success) {
      toast.success(state.success);
      setOpen(false);
    }
  }, [state.success]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button />}>
        <UserPlus className="size-4" />
        Convidar colaborador
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar colaborador</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="conv-nome">Nome</Label>
            <Input id="conv-nome" name="nome" required autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="conv-email">E-mail</Label>
            <Input id="conv-email" name="email" type="email" required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="conv-role">Papel</Label>
            <select
              id="conv-role"
              name="role"
              defaultValue="colaborador"
              className={selectClasses}
            >
              <option value="colaborador">Colaborador</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {state.error ? (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Enviando…" : "Enviar convite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ColaboradoresClient({
  colaboradores,
  meuUserId,
}: {
  colaboradores: ColaboradorRow[];
  meuUserId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);

  function toggleAtivo(c: ColaboradorRow) {
    setPendingId(c.id);
    startTransition(async () => {
      const r = await definirAtivoColaborador(c.id, !c.ativo);
      if (r.error) toast.error(r.error);
      else toast.success(c.ativo ? "Colaborador desativado." : "Colaborador ativado.");
      setPendingId(null);
    });
  }

  function mudarRole(c: ColaboradorRow, role: string) {
    if (role === c.role) return;
    setPendingId(c.id);
    startTransition(async () => {
      const r = await definirRoleColaborador(c.id, role);
      if (r.error) toast.error(r.error);
      else toast.success("Papel atualizado.");
      setPendingId(null);
    });
  }

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Colaboradores
          </h2>
          <p className="text-sm text-ink-muted">
            Convide a equipe e gerencie papéis e acesso.
          </p>
        </div>
        <ConviteDialog />
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Criado em</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {colaboradores.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-ink-muted">
                  Nenhum colaborador cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              colaboradores.map((c) => {
                const ehVoce = c.user_id === meuUserId;
                const linhaPendente = isPending && pendingId === c.id;
                return (
                  <TableRow key={c.id} className={cn(linhaPendente && "opacity-60")}>
                    <TableCell className="font-medium text-ink">
                      {c.nome}
                      {ehVoce ? (
                        <span className="ml-1 text-xs text-ink-muted">(você)</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-ink-muted">{c.email}</TableCell>
                    <TableCell>
                      <select
                        aria-label={`Papel de ${c.nome}`}
                        className={selectClasses}
                        value={c.role}
                        disabled={linhaPendente}
                        onChange={(e) => mudarRole(c, e.target.value)}
                      >
                        <option value="colaborador">Colaborador</option>
                        <option value="admin">Admin</option>
                      </select>
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.ativo ? "default" : "outline"}>
                        {c.ativo ? "Ativo" : "Inativo"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-ink-muted">
                      {new Date(c.criado_em).toLocaleDateString("pt-BR")}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant={c.ativo ? "ghost" : "outline"}
                        size="sm"
                        disabled={linhaPendente || (ehVoce && c.ativo)}
                        onClick={() => toggleAtivo(c)}
                      >
                        {c.ativo ? "Desativar" : "Ativar"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
