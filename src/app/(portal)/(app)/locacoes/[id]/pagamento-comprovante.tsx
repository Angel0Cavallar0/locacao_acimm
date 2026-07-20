"use client";

import { Check, Copy, FileCheck2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { dataSP } from "@/lib/calendario/tempo";
import type { DadosPagamento } from "@/lib/contratos/tipos";
import { FORMA_PAGAMENTO_ROTULO } from "@/lib/locacoes/tipos";
import type { PagamentoPortal } from "@/lib/locacoes/portal-tipos";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { removerComprovante, urlComprovante } from "./actions";
import { TIPOS_COMPROVANTE, subirComprovante } from "./comprovante-upload";

const STATUS_ROTULO: Record<string, string> = {
  pendente: "Pendente",
  pago: "Pago",
  isento: "Isento",
  estornado: "Estornado",
};

/** Instruções conforme a forma de pagamento (§5), a partir da config da ACIMM. */
function Instrucoes({
  forma,
  dadosPagamento,
  contato,
}: {
  forma: PagamentoPortal["forma"];
  dadosPagamento: DadosPagamento;
  contato: string | null;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1500);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  }

  const contatoLinha = contato ? (
    <p className="text-xs text-ink-muted">Em caso de dúvida, fale com a ACIMM: {contato}</p>
  ) : null;

  if (forma === "pix") {
    if (!dadosPagamento.pix.trim()) {
      return (
        <div className="rounded-md bg-surface-muted px-3 py-2 text-sm">
          <p className="text-ink">Combine a chave Pix com a ACIMM para efetuar o pagamento.</p>
          {contatoLinha}
        </div>
      );
    }
    return (
      <div className="flex flex-col gap-1.5 rounded-md bg-surface-muted px-3 py-2 text-sm">
        <p className="text-xs text-ink-muted">Chave Pix</p>
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 break-all font-medium text-ink">
            {dadosPagamento.pix}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => copiar(dadosPagamento.pix)}
          >
            {copiado ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copiado ? "Copiado" : "Copiar"}
          </Button>
        </div>
      </div>
    );
  }

  if (forma === "transferencia") {
    return (
      <div className="flex flex-col gap-0.5 rounded-md bg-surface-muted px-3 py-2 text-sm">
        <p className="text-xs text-ink-muted">Dados para transferência</p>
        <p className="text-ink">
          {dadosPagamento.banco}
          {dadosPagamento.codigoBanco ? ` (${dadosPagamento.codigoBanco})` : ""}
        </p>
        <p className="text-ink">
          Agência {dadosPagamento.agencia} · Conta {dadosPagamento.conta}
        </p>
        {contatoLinha}
      </div>
    );
  }

  // boleto_avulso | boleto_mensalidade
  return (
    <div className="rounded-md bg-surface-muted px-3 py-2 text-sm">
      <p className="text-ink">
        {forma === "boleto_mensalidade"
          ? "O valor será lançado na sua mensalidade da ACIMM."
          : "O boleto será enviado pela ACIMM."}
      </p>
      {contatoLinha}
    </div>
  );
}

export function PagamentoComprovante({
  pagamento,
  dadosPagamento,
  contato,
}: {
  pagamento: PagamentoPortal;
  dadosPagamento: DadosPagamento;
  contato: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enviando, setEnviando] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const pendente = pagamento.status === "pendente";
  const pago = pagamento.status === "pago";

  async function aoEscolher(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setEnviando(true);
    const r = await subirComprovante(pagamento.id, file);
    setEnviando(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    toast.success("Comprovante enviado.");
    router.refresh();
  }

  async function abrir() {
    setAbrindo(true);
    const r = await urlComprovante(pagamento.id);
    setAbrindo(false);
    if ("error" in r) {
      toast.error(r.error);
      return;
    }
    window.open(r.url, "_blank", "noopener,noreferrer");
  }

  async function remover() {
    setEnviando(true);
    const r = await removerComprovante({ pagamentoId: pagamento.id });
    setEnviando(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success("Comprovante removido.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-ink">{pagamento.descricao}</p>
          <p className="text-xs text-ink-muted">
            {FORMA_PAGAMENTO_ROTULO[pagamento.forma]} ·{" "}
            {centavosParaBRL(pagamento.valorCentavos)}
          </p>
        </div>
        <span
          className={
            pago
              ? "rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"
              : "rounded-full bg-surface-muted px-2.5 py-1 text-xs font-medium text-ink-muted"
          }
        >
          {STATUS_ROTULO[pagamento.status] ?? pagamento.status}
        </span>
      </div>

      {pendente ? (
        <Instrucoes
          forma={pagamento.forma}
          dadosPagamento={dadosPagamento}
          contato={contato}
        />
      ) : null}

      {pago && pagamento.baixaEmUtc ? (
        <p className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
          <Check className="size-3.5" />
          Pagamento confirmado em {dataSP(pagamento.baixaEmUtc)}
        </p>
      ) : null}

      {pagamento.temComprovante ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
            <FileCheck2 className="size-3.5" />
            Comprovante enviado
          </span>
          <Button variant="outline" size="sm" loading={abrindo} onClick={abrir}>
            Ver comprovante
          </Button>
          {pendente ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                loading={enviando}
                onClick={() => inputRef.current?.click()}
              >
                Substituir
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={remover}
                disabled={enviando}
              >
                Remover
              </Button>
            </>
          ) : null}
        </div>
      ) : pendente ? (
        <Button
          variant="outline"
          size="sm"
          loading={enviando}
          onClick={() => inputRef.current?.click()}
          className="self-start"
        >
          <Upload className="size-4" />
          Enviar comprovante
        </Button>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={TIPOS_COMPROVANTE.join(",")}
        className="hidden"
        onChange={aoEscolher}
      />
    </div>
  );
}
