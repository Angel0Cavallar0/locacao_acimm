"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { ModoEnvioContrato } from "@/lib/contratos/tipos";
import { cn } from "@/lib/utils";
import { salvarModoContrato } from "./actions";

export function ContratoModoForm({
  modoInicial,
  autentiqueDisponivel,
}: {
  modoInicial: ModoEnvioContrato;
  autentiqueDisponivel: boolean;
}) {
  const [modo, setModo] = useState<ModoEnvioContrato>(modoInicial);
  const [salvando, setSalvando] = useState(false);

  async function escolher(novo: ModoEnvioContrato) {
    if (novo === modo || salvando) return;
    const anterior = modo;
    setModo(novo);
    setSalvando(true);
    const r = await salvarModoContrato(novo);
    setSalvando(false);
    if (r.error) {
      setModo(anterior);
      toast.error(r.error);
      return;
    }
    toast.success("Modo de envio atualizado.");
  }

  return (
    <div className="flex flex-col gap-2">
      <Opcao
        titulo="Enviar por e-mail"
        descricao="Gera o PDF e envia ao locatário por e-mail (com anexo). Assinatura registrada manualmente pela equipe."
        selecionado={modo === "email"}
        onClick={() => escolher("email")}
      />
      <Opcao
        titulo="Assinatura digital (Autentique)"
        descricao={
          autentiqueDisponivel
            ? "Envia para assinatura eletrônica via Autentique."
            : "Indisponível até configurar o token da Autentique."
        }
        selecionado={modo === "autentique"}
        disabled={!autentiqueDisponivel}
        onClick={() => escolher("autentique")}
      />
    </div>
  );
}

function Opcao({
  titulo,
  descricao,
  selecionado,
  disabled = false,
  onClick,
}: {
  titulo: string;
  descricao: string;
  selecionado: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
        selecionado ? "border-brand bg-brand/5" : "hover:bg-surface-muted",
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          selecionado ? "border-brand" : "border-input",
        )}
      >
        {selecionado ? <span className="size-2 rounded-full bg-brand" /> : null}
      </span>
      <span>
        <span className="block text-sm font-medium text-ink">{titulo}</span>
        <span className="block text-xs text-ink-muted">{descricao}</span>
      </span>
    </button>
  );
}
