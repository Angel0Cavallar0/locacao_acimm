"use client";

import { Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { formatarDocumento } from "@/lib/locacoes/tipos";
import {
  type AssociadoGestao,
  buscarAssociadosGestao,
  desvincularConta,
  liberarAcessoManual,
  reenviarConvite,
} from "./actions";

const SITUACAO: Record<string, string> = {
  ativo: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  suspenso: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  excluido: "bg-destructive/10 text-destructive",
};

function LiberarDialog({
  associado,
  aoConcluir,
}: {
  associado: AssociadoGestao;
  aoConcluir: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [email, setEmail] = useState(associado.emails[0] ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSalvando(true);
    const r = await liberarAcessoManual(associado.id, email.trim());
    setSalvando(false);
    if (r.error) {
      setErro(r.error);
      return;
    }
    toast.success(r.success ?? "Convite enviado.");
    setAberto(false);
    aoConcluir();
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <Button size="sm" onClick={() => setAberto(true)}>
        Liberar acesso
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Liberar acesso manualmente</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <p className="text-sm text-ink-muted">
            Confirme a identidade pelos canais atuais (telefone/WhatsApp) antes de
            enviar. O convite vai para o e-mail informado; isso não altera o
            cadastro do Sophus.
          </p>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="lib-email">E-mail para o convite</Label>
            <Input
              id="lib-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
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
              Enviar convite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DesvincularDialog({
  associado,
  aoConcluir,
}: {
  associado: AssociadoGestao;
  aoConcluir: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const confere = texto.trim().toLowerCase() === "desvincular";

  async function confirmar() {
    setSalvando(true);
    const r = await desvincularConta(associado.id);
    setSalvando(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success(r.success ?? "Conta desvinculada.");
    setAberto(false);
    setTexto("");
    aoConcluir();
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setAberto(true)}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        Desvincular
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Desvincular conta</DialogTitle>
        </DialogHeader>
        <div className="text-sm text-ink-muted">
          A conta de acesso será removida e o associado poderá fazer um novo
          primeiro acesso (útil quando trocou de e-mail). O histórico e os dados
          cadastrais permanecem.
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="desv-conf">
            Digite <span className="font-medium text-ink">desvincular</span> para
            confirmar
          </Label>
          <Input
            id="desv-conf"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            autoComplete="off"
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" type="button" />}>
            Cancelar
          </DialogClose>
          <Button
            variant="destructive"
            disabled={!confere || salvando}
            loading={salvando}
            onClick={confirmar}
          >
            Desvincular
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssociadosClient() {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<AssociadoGestao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [buscou, setBuscou] = useState(false);
  const [pendente, iniciar] = useTransition();
  const termoRef = useRef(termo);
  termoRef.current = termo;

  const buscar = useCallback(async (t: string) => {
    if (t.trim().length < 2) {
      setResultados([]);
      setBuscou(false);
      return;
    }
    setCarregando(true);
    const r = await buscarAssociadosGestao(t);
    setCarregando(false);
    setBuscou(true);
    setResultados(r);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => buscar(termo), 350);
    return () => clearTimeout(t);
  }, [termo, buscar]);

  const recarregar = () => buscar(termoRef.current);

  function onReenviar(id: string) {
    iniciar(async () => {
      const r = await reenviarConvite(id);
      if (r.error) toast.error(r.error);
      else toast.success(r.success ?? "Reenviado.");
    });
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h2 className="font-display text-lg font-semibold text-ink">
          Associados
        </h2>
        <p className="text-sm text-ink-muted">
          Gestão de acesso ao portal. Os dados cadastrais são somente leitura
          (fonte: Sophus).
        </p>
      </div>

      <div className="relative mb-4">
        <Search className="-translate-y-1/2 absolute top-1/2 left-3 size-4 text-ink-muted" />
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar por nome, razão social ou documento…"
          className="pl-9"
        />
      </div>

      {carregando ? (
        <p className="py-8 text-center text-sm text-ink-muted">Buscando…</p>
      ) : buscou && resultados.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-ink-muted">
            Nenhum associado encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {resultados.map((a) => (
            <Card key={a.id}>
              <CardContent className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="truncate font-medium text-ink">
                        {a.razaoSocial ?? a.nome}
                      </h3>
                      <span
                        className={`inline-flex h-5 items-center rounded-full px-2 text-xs font-medium ${SITUACAO[a.situacao] ?? ""}`}
                      >
                        {a.situacao}
                      </span>
                    </div>
                    <p className="text-xs text-ink-muted">
                      {a.documento ? formatarDocumento(a.documento) : "sem documento"}
                      {a.emails.length > 0 ? ` · ${a.emails.join(", ")}` : ""}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {a.temConta ? (
                      <Badge variant="default">Conta ativa</Badge>
                    ) : (
                      <Badge variant="outline">Sem conta</Badge>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {a.temConta ? (
                    <>
                      <span className="mr-auto text-xs text-ink-muted">
                        Login: {a.emailLogin ?? "—"}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pendente}
                        onClick={() => onReenviar(a.id)}
                      >
                        Reenviar convite
                      </Button>
                      <DesvincularDialog associado={a} aoConcluir={recarregar} />
                    </>
                  ) : (
                    <div className="ml-auto">
                      <LiberarDialog associado={a} aoConcluir={recarregar} />
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
