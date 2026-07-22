"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Link2Off,
  Loader2,
  MessageCircle,
  QrCode,
  RefreshCw,
  RotateCw,
  Send,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { EstadoConexaoWhatsapp } from "@/lib/integracoes/evolution";
import {
  atualizarStatusWhatsappAction,
  desconectarWhatsappAction,
  enviarTesteWhatsappAction,
  gerarQrWhatsappAction,
  reiniciarWhatsappAction,
} from "./actions";

/** Formata "5519998887766" como "+55 (19) 99888-7766" para exibição. */
function formatarNumero(numero: string | null): string | null {
  if (!numero) return null;
  const m = numero.match(/^55(\d{2})(\d{5})(\d{4})$/);
  if (!m) return numero;
  return `+55 (${m[1]}) ${m[2]}-${m[3]}`;
}

export function WhatsappConexao({
  configurado,
  estadoInicial,
  numero: numeroInicial,
  perfil: perfilInicial,
}: {
  configurado: boolean;
  estadoInicial: EstadoConexaoWhatsapp;
  numero: string | null;
  perfil: string | null;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoConexaoWhatsapp>(estadoInicial);
  const [numero, setNumero] = useState(numeroInicial);
  const [perfil, setPerfil] = useState(perfilInicial);
  const [qr, setQr] = useState<{
    base64: string | null;
    pairingCode: string | null;
  } | null>(null);
  const [gerando, setGerando] = useState(false);
  const [reiniciando, setReiniciando] = useState(false);
  const [desconectando, setDesconectando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [numeroTeste, setNumeroTeste] = useState("");

  const conectado = estado === "open";
  // Enquanto há QR na tela (aguardando leitura) ou a instância está em
  // transição, checamos o status periodicamente até conectar.
  const devePolling = !conectado && (qr !== null || estado === "connecting");

  useEffect(() => {
    if (!devePolling) return;
    let ativo = true;
    const id = setInterval(async () => {
      const r = await atualizarStatusWhatsappAction();
      if (!ativo) return;
      setNumero(r.numero);
      setPerfil(r.perfil);
      setEstado(r.estado);
      if (r.estado === "open") {
        setQr(null);
        toast.success("WhatsApp conectado com sucesso.");
        router.refresh();
      }
    }, 4000);
    return () => {
      ativo = false;
      clearInterval(id);
    };
  }, [devePolling, router]);

  async function gerarQr() {
    setGerando(true);
    const r = await gerarQrWhatsappAction();
    setGerando(false);
    if (r.error) return toast.error(r.error);
    setQr({ base64: r.base64 ?? null, pairingCode: r.pairingCode ?? null });
  }

  async function reiniciar() {
    setReiniciando(true);
    const r = await reiniciarWhatsappAction();
    setReiniciando(false);
    if (r.error) return toast.error(r.error);
    toast.success("Conexão reiniciada.");
    router.refresh();
  }

  async function desconectar() {
    setDesconectando(true);
    const r = await desconectarWhatsappAction();
    setDesconectando(false);
    if (r.error) return toast.error(r.error);
    setEstado("close");
    setNumero(null);
    setPerfil(null);
    setQr(null);
    toast.success("Número desconectado.");
    router.refresh();
  }

  async function enviarTeste(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    const r = await enviarTesteWhatsappAction(numeroTeste);
    setEnviando(false);
    if (r.error) return toast.error(r.error);
    toast.success("Mensagem de teste enviada.");
    setNumeroTeste("");
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-md bg-brand/10 text-brand">
            <MessageCircle className="size-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-medium text-ink">Conexão do WhatsApp</h3>
            <p className="text-xs text-ink-muted">
              Número que envia as mensagens automáticas aos associados e
              locatários.
            </p>
          </div>
          {configurado ? <StatusBadge estado={estado} /> : null}
        </div>

        {!configurado ? (
          <div className="rounded-lg border border-dashed p-4 text-sm text-ink-muted">
            Aguardando configuração das credenciais do WhatsApp (variáveis de
            ambiente). Assim que forem definidas, a conexão fica disponível aqui.
          </div>
        ) : conectado ? (
          <ConectadoView
            numero={numero}
            perfil={perfil}
            reiniciando={reiniciando}
            desconectando={desconectando}
            enviando={enviando}
            numeroTeste={numeroTeste}
            onNumeroTeste={setNumeroTeste}
            onReiniciar={reiniciar}
            onDesconectar={desconectar}
            onEnviarTeste={enviarTeste}
          />
        ) : (
          <DesconectadoView
            estado={estado}
            qr={qr}
            gerando={gerando}
            onGerar={gerarQr}
          />
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ estado }: { estado: EstadoConexaoWhatsapp }) {
  if (estado === "open") {
    return (
      <Badge variant="secondary">
        <CheckCircle2 className="size-3" />
        Conectado
      </Badge>
    );
  }
  if (estado === "connecting") {
    return (
      <Badge variant="secondary">
        <Loader2 className="size-3 animate-spin" />
        Conectando…
      </Badge>
    );
  }
  return (
    <Badge variant="destructive">
      <AlertTriangle className="size-3" />
      Desconectado
    </Badge>
  );
}

function ConectadoView({
  numero,
  perfil,
  reiniciando,
  desconectando,
  enviando,
  numeroTeste,
  onNumeroTeste,
  onReiniciar,
  onDesconectar,
  onEnviarTeste,
}: {
  numero: string | null;
  perfil: string | null;
  reiniciando: boolean;
  desconectando: boolean;
  enviando: boolean;
  numeroTeste: string;
  onNumeroTeste: (v: string) => void;
  onReiniciar: () => void;
  onDesconectar: () => void;
  onEnviarTeste: (e: React.FormEvent) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 rounded-lg border p-3">
        <span className="text-sm font-medium text-ink">
          {perfil || "Número conectado"}
        </span>
        <span className="text-sm text-ink-muted">
          {formatarNumero(numero) ?? "Número indisponível"}
        </span>
      </div>

      <form onSubmit={onEnviarTeste} className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink">
          Enviar mensagem de teste
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="tel"
            inputMode="tel"
            placeholder="(19) 99999-9999"
            value={numeroTeste}
            onChange={(e) => onNumeroTeste(e.target.value)}
            className="h-9 max-w-[220px]"
            disabled={enviando}
          />
          <Button
            type="submit"
            variant="outline"
            loading={enviando}
            disabled={numeroTeste.trim().length === 0}
          >
            <Send className="size-4" />
            Enviar teste
          </Button>
        </div>
        <span className="text-xs text-ink-muted">
          Envia um WhatsApp de confirmação ao número informado.
        </span>
      </form>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" loading={reiniciando} onClick={onReiniciar}>
          <RotateCw className="size-4" />
          Reiniciar
        </Button>

        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="outline" disabled={desconectando}>
                <Link2Off className="size-4" />
                Desconectar
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desconectar o WhatsApp?</AlertDialogTitle>
              <AlertDialogDescription>
                As mensagens automáticas (WhatsApp) deixam de ser enviadas até
                você conectar um número novamente. O envio por e-mail continua
                funcionando normalmente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                loading={desconectando}
                onClick={onDesconectar}
              >
                Desconectar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function DesconectadoView({
  estado,
  qr,
  gerando,
  onGerar,
}: {
  estado: EstadoConexaoWhatsapp;
  qr: { base64: string | null; pairingCode: string | null } | null;
  gerando: boolean;
  onGerar: () => void;
}) {
  if (!qr) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">
          {estado === "connecting"
            ? "Conexão em andamento. Gere o QR code para concluir o pareamento."
            : "Nenhum número conectado. Gere o QR code e leia pelo aplicativo do WhatsApp para conectar um aparelho."}
        </p>
        <Button className="w-fit" loading={gerando} onClick={onGerar}>
          <QrCode className="size-4" />
          Gerar QR code
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="flex flex-col items-center gap-2 text-center">
        {qr.base64 ? (
          // biome-ignore lint/performance/noImgElement: QR é um data URI efêmero, não um asset otimizável pelo next/image
          <img
            src={qr.base64}
            alt="QR code para conectar o WhatsApp"
            className="size-60 rounded-lg border bg-white p-2"
          />
        ) : null}
        {qr.pairingCode ? (
          <div className="text-sm text-ink-muted">
            Ou use o código de pareamento:{" "}
            <span className="font-mono font-medium text-ink">
              {qr.pairingCode}
            </span>
          </div>
        ) : null}
      </div>

      <ol className="w-full list-decimal space-y-1 rounded-lg border bg-surface-muted p-3 pl-7 text-xs text-ink-muted">
        <li>Abra o WhatsApp no celular do número da ACIMM.</li>
        <li>
          Toque em <span className="font-medium">Aparelhos conectados</span> →{" "}
          <span className="font-medium">Conectar um aparelho</span>.
        </li>
        <li>Aponte a câmera para o QR code acima.</li>
      </ol>

      <div className="flex items-center gap-2 text-xs text-ink-muted">
        <Loader2 className="size-3 animate-spin" />
        Aguardando a leitura… a página atualiza sozinha ao conectar.
      </div>

      <Button
        variant="outline"
        size="sm"
        loading={gerando}
        onClick={onGerar}
      >
        <RefreshCw className="size-4" />
        Gerar novo QR
      </Button>
    </div>
  );
}
