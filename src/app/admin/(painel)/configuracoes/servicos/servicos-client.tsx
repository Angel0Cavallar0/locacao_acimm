"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  MODELO_COBRANCA_ROTULO,
  type ModeloCobranca,
  type ServicoAdicional,
  UNIDADES_SUGERIDAS,
} from "@/lib/servicos-adicionais/tipos";
import { brlParaCentavos, centavosParaBRL } from "@/lib/utils/moeda";
import {
  alternarAtivoServicoAction,
  criarServicoAction,
  editarServicoAction,
  excluirServicoAction,
} from "./actions";

const selectClasses =
  "h-9 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

type Sala = { id: string; nome: string };

function ServicoDialog({
  servico,
  salas,
  aberto,
  aoAbrir,
}: {
  servico?: ServicoAdicional;
  salas: Sala[];
  aberto: boolean;
  aoAbrir: (o: boolean) => void;
}) {
  const router = useRouter();
  const [nome, setNome] = useState(servico?.nome ?? "");
  const [descricao, setDescricao] = useState(servico?.descricao ?? "");
  const [modelo, setModelo] = useState<ModeloCobranca>(
    servico?.modeloCobranca ?? "por_unidade",
  );
  const [unidade, setUnidade] = useState(servico?.unidade ?? "");
  const [valor, setValor] = useState(
    servico?.valorUnitarioCentavos != null
      ? (servico.valorUnitarioCentavos / 100).toFixed(2).replace(".", ",")
      : "",
  );
  const [salaId, setSalaId] = useState(servico?.salaId ?? "");
  const [requerAprovacao, setRequerAprovacao] = useState(
    servico?.requerAprovacao ?? false,
  );
  const [sujeitoDisponibilidade, setSujeitoDisponibilidade] = useState(
    servico?.sujeitoDisponibilidade ?? false,
  );
  const [ativo, setAtivo] = useState(servico?.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const sobConsulta = modelo === "sob_consulta";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    const payload = {
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      modeloCobranca: modelo,
      unidade: unidade.trim() || null,
      valorUnitarioCentavos: sobConsulta ? null : brlParaCentavos(valor),
      salaId: salaId || null,
      requerAprovacao,
      sujeitoDisponibilidade,
      ativo,
    };
    const r = servico
      ? await editarServicoAction(servico.id, payload)
      : await criarServicoAction(payload);
    setSalvando(false);
    if ("erro" in r) {
      setErro(r.erro);
      return;
    }
    toast.success(servico ? "Serviço salvo." : "Serviço criado.");
    aoAbrir(false);
    router.refresh();
  }

  return (
    <Dialog open={aberto} onOpenChange={aoAbrir}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{servico ? "Editar" : "Novo"} serviço</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-nome">Nome</Label>
            <Input
              id="s-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Impressão de certificados"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="s-desc">Descrição (vai para o contrato)</Label>
            <textarea
              id="s-desc"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={2}
              className="rounded-lg border border-input bg-transparent px-2 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-modelo">Modelo de cobrança</Label>
              <select
                id="s-modelo"
                className={selectClasses}
                value={modelo}
                onChange={(e) => setModelo(e.target.value as ModeloCobranca)}
              >
                {(
                  Object.keys(MODELO_COBRANCA_ROTULO) as ModeloCobranca[]
                ).map((m) => (
                  <option key={m} value={m}>
                    {MODELO_COBRANCA_ROTULO[m]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-unidade">Unidade</Label>
              <Input
                id="s-unidade"
                list="unidades-sugeridas"
                value={unidade}
                onChange={(e) => setUnidade(e.target.value)}
                placeholder="certificado, cadeira…"
              />
              <datalist id="unidades-sugeridas">
                {UNIDADES_SUGERIDAS.map((u) => (
                  <option key={u} value={u} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-valor">Valor unitário (R$)</Label>
              <Input
                id="s-valor"
                inputMode="decimal"
                value={sobConsulta ? "" : valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder={sobConsulta ? "sob consulta" : "0,00"}
                disabled={sobConsulta}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="s-sala">Sala vinculada</Label>
              <select
                id="s-sala"
                className={selectClasses}
                value={salaId}
                onChange={(e) => setSalaId(e.target.value)}
              >
                <option value="">Qualquer sala</option>
                {salas.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={requerAprovacao}
                onChange={(e) => setRequerAprovacao(e.target.checked)}
              />
              Requer aprovação prévia (gera etapa no checklist)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={sujeitoDisponibilidade}
                onChange={(e) => setSujeitoDisponibilidade(e.target.checked)}
              />
              Sujeito à disponibilidade (não confirma automaticamente)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
              />
              Ativo (disponível para novas locações)
            </label>
          </div>

          {erro ? (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              Cancelar
            </DialogClose>
            <Button type="submit" loading={salvando}>
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ServicosClient({
  servicos,
  salas,
}: {
  servicos: ServicoAdicional[];
  salas: Sala[];
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const [novoAberto, setNovoAberto] = useState(false);
  const [editando, setEditando] = useState<ServicoAdicional | null>(null);

  function alternar(id: string, ativo: boolean) {
    iniciar(async () => {
      const r = await alternarAtivoServicoAction(id, ativo);
      if ("erro" in r) toast.error(r.erro);
      else router.refresh();
    });
  }

  function excluir(id: string) {
    iniciar(async () => {
      const r = await excluirServicoAction(id);
      if ("erro" in r) toast.error(r.erro);
      else {
        toast.success("Serviço excluído.");
        router.refresh();
      }
    });
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Serviços adicionais
          </h2>
          <p className="text-sm text-ink-muted">
            Catálogo de serviços contratáveis nas locações — por unidade, fixo
            por evento ou sob consulta.
          </p>
        </div>
        <Button size="sm" onClick={() => setNovoAberto(true)}>
          <Plus className="size-4" />
          Novo serviço
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Serviço</TableHead>
              <TableHead>Modelo</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Sala</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {servicos.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="py-8 text-center text-sm text-ink-muted"
                >
                  Nenhum serviço cadastrado.
                </TableCell>
              </TableRow>
            ) : (
              servicos.map((s) => (
                <TableRow key={s.id} className={s.ativo ? "" : "opacity-60"}>
                  <TableCell>
                    <p className="font-medium text-ink">{s.nome}</p>
                    {s.unidade ? (
                      <p className="text-xs text-ink-muted">un.: {s.unidade}</p>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {MODELO_COBRANCA_ROTULO[s.modeloCobranca]}
                  </TableCell>
                  <TableCell className="text-right text-ink-muted">
                    {s.valorUnitarioCentavos != null
                      ? centavosParaBRL(s.valorUnitarioCentavos)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-ink-muted">
                    {s.salaNome ?? "Qualquer"}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {s.requerAprovacao ? (
                        <Badge variant="outline">Aprovação</Badge>
                      ) : null}
                      {s.sujeitoDisponibilidade ? (
                        <Badge variant="outline">Disponibilidade</Badge>
                      ) : null}
                      {!s.ativo ? (
                        <Badge variant="secondary">Inativo</Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={pendente}
                        onClick={() => alternar(s.id, !s.ativo)}
                      >
                        {s.ativo ? "Desativar" : "Ativar"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Editar"
                        onClick={() => setEditando(s)}
                      >
                        <Pencil className="size-4" />
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label="Excluir"
                              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          }
                        />
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Excluir "{s.nome}"?
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              O serviço some do catálogo. Locações que já o usam
                              mantêm o histórico.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => excluir(s.id)}>
                              Excluir
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <ServicoDialog
        salas={salas}
        aberto={novoAberto}
        aoAbrir={setNovoAberto}
      />
      {editando ? (
        <ServicoDialog
          key={editando.id}
          servico={editando}
          salas={salas}
          aberto={editando !== null}
          aoAbrir={(o) => !o && setEditando(null)}
        />
      ) : null}
    </div>
  );
}
