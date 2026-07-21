"use client";

import { AlertTriangle, Mail, MessageCircle, Pencil, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import type { TemplateGestao } from "@/lib/notificacoes/templates-dados";
import { renderizarTexto } from "@/lib/notificacoes/render-core";
import { montarEmailHtml } from "@/lib/notificacoes/templates";
import { salvarTemplateAction } from "./actions";

const campoClasses =
  "w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
const textareaClasses = `min-h-24 ${campoClasses}`;

/** Payload de exemplo para a pré-visualização. */
const EXEMPLO = {
  nome: "Ana Souza",
  loc: "LOC-000123",
  salas: "Sala Azul",
  data: "21/07/2026",
  horario: "08:00–12:00",
  total: "R$ 300,00",
  motivo: "conflito de agenda",
  instrucoes: "Pague via Pix — chave: financeiro@acimm.com.br.",
  link: "https://portal/locacoes/123",
  assinaturaLink: "https://assinar/123",
  linkAdmin: "https://portal/admin/locacoes/123",
  sala: "Sala Azul",
  qtd: "2",
  primeiro: "João Lima",
  rotulo: "21/07 a 27/07",
};

const GRUPOS: { destino: TemplateGestao["destino"]; titulo: string; nota: string }[] = [
  {
    destino: "locatario",
    titulo: "Mensagens ao locatário",
    nota: "Enviadas ao associado ou locatário externo a cada etapa.",
  },
  {
    destino: "interno",
    titulo: "Avisos internos (ACIMM)",
    nota: "E-mails operacionais para a equipe.",
  },
  {
    destino: "compras",
    titulo: "Compras",
    nota: "PDF semanal de coffee break.",
  },
];

function CanalBadge({ canal }: { canal: "whatsapp" | "email" }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
      {canal === "whatsapp" ? (
        <MessageCircle className="size-3" />
      ) : (
        <Mail className="size-3" />
      )}
      {canal === "whatsapp" ? "WhatsApp" : "E-mail"}
    </span>
  );
}

function EditarDialog({
  t,
  aoFechar,
  aoSalvar,
}: {
  t: TemplateGestao;
  aoFechar: () => void;
  aoSalvar: () => void;
}) {
  const [whatsapp, setWhatsapp] = useState(t.whatsapp);
  const [assunto, setAssunto] = useState(t.emailAssunto);
  const [corpo, setCorpo] = useState(t.emailCorpo);
  const [salvando, setSalvando] = useState(false);
  const refWhats = useRef<HTMLTextAreaElement | null>(null);
  const refAssunto = useRef<HTMLInputElement | null>(null);
  const refCorpo = useRef<HTMLTextAreaElement | null>(null);
  const foco = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);

  const temWhats = t.canais.includes("whatsapp");
  const temEmail = t.canais.includes("email");

  function inserir(tag: string) {
    const el = foco.current;
    const trecho = `{{${tag}}}`;
    if (!el) return;
    const ini = el.selectionStart ?? el.value.length;
    const fim = el.selectionEnd ?? el.value.length;
    const novo = el.value.slice(0, ini) + trecho + el.value.slice(fim);
    if (el === refWhats.current) setWhatsapp(novo);
    else if (el === refAssunto.current) setAssunto(novo);
    else if (el === refCorpo.current) setCorpo(novo);
    // Reposiciona o cursor após o trecho inserido.
    requestAnimationFrame(() => {
      el.focus();
      const pos = ini + trecho.length;
      el.setSelectionRange(pos, pos);
    });
  }

  async function salvar() {
    setSalvando(true);
    const r = await salvarTemplateAction({
      chave: t.chave,
      ativo: t.ativo,
      whatsapp,
      emailAssunto: assunto,
      emailCorpo: corpo,
    });
    setSalvando(false);
    if ("erro" in r) {
      toast.error(r.erro);
      return;
    }
    toast.success("Modelo salvo.");
    aoSalvar();
  }

  function restaurar() {
    setWhatsapp("");
    setAssunto("");
    setCorpo("");
    toast.info("Campos limpos — salve para voltar ao texto padrão.");
  }

  return (
    <Dialog open onOpenChange={(o) => !o && aoFechar()}>
      <DialogContent className="max-h-[90vh] w-full overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t.rotulo}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* Variáveis disponíveis */}
          {t.variaveis.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-ink-muted">
                Variáveis (clique para inserir no campo em foco)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {t.variaveis.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => inserir(v)}
                    className="rounded-full border px-2.5 py-1 font-mono text-xs text-ink-muted hover:border-brand hover:text-brand"
                  >
                    {`{{${v}}}`}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {temWhats ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="tpl-whats">Mensagem de WhatsApp</Label>
              <textarea
                id="tpl-whats"
                ref={refWhats}
                value={whatsapp}
                onFocus={() => {
                  foco.current = refWhats.current;
                }}
                onChange={(e) => setWhatsapp(e.target.value)}
                className={textareaClasses}
              />
            </div>
          ) : null}

          {temEmail ? (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tpl-assunto">Assunto do e-mail</Label>
                <input
                  id="tpl-assunto"
                  ref={refAssunto}
                  value={assunto}
                  onFocus={() => {
                    foco.current = refAssunto.current;
                  }}
                  onChange={(e) => setAssunto(e.target.value)}
                  className={campoClasses}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tpl-corpo">Corpo do e-mail</Label>
                <textarea
                  id="tpl-corpo"
                  ref={refCorpo}
                  value={corpo}
                  onFocus={() => {
                    foco.current = refCorpo.current;
                  }}
                  onChange={(e) => setCorpo(e.target.value)}
                  className={`${textareaClasses} min-h-32`}
                />
                <p className="text-xs text-ink-muted">
                  O e-mail é enviado com o cabeçalho e a moldura visual da ACIMM.
                  Uma linha em branco separa parágrafos.
                </p>
              </div>
            </>
          ) : null}

          {/* Pré-visualização */}
          <div className="flex flex-col gap-2 rounded-lg border bg-surface-muted/40 p-3">
            <span className="text-xs font-semibold text-ink">
              Pré-visualização (dados de exemplo)
            </span>
            {temWhats ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">WhatsApp</span>
                <p className="rounded-md bg-surface p-2 text-sm whitespace-pre-wrap text-ink">
                  {renderizarTexto(whatsapp, EXEMPLO) || "—"}
                </p>
              </div>
            ) : null}
            {temEmail ? (
              <div className="flex flex-col gap-1">
                <span className="text-xs text-ink-muted">
                  E-mail — {renderizarTexto(assunto, EXEMPLO) || "(sem assunto)"}
                </span>
                <iframe
                  title="Prévia do e-mail"
                  className="h-64 w-full rounded-md border bg-white"
                  srcDoc={montarEmailHtml(renderizarTexto(corpo, EXEMPLO))}
                />
              </div>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={restaurar}
            >
              <RotateCcw className="size-4" />
              Restaurar padrão
            </Button>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={aoFechar}>
                Cancelar
              </Button>
              <Button type="button" loading={salvando} onClick={salvar}>
                Salvar
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function MensagensClient({ templates }: { templates: TemplateGestao[] }) {
  const router = useRouter();
  const [editando, setEditando] = useState<TemplateGestao | null>(null);
  const [alternando, setAlternando] = useState<string | null>(null);

  async function alternar(t: TemplateGestao) {
    setAlternando(t.chave);
    const r = await salvarTemplateAction({
      chave: t.chave,
      ativo: !t.ativo,
      whatsapp: t.whatsapp,
      emailAssunto: t.emailAssunto,
      emailCorpo: t.emailCorpo,
    });
    setAlternando(null);
    if ("erro" in r) {
      toast.error(r.erro);
      return;
    }
    toast.success(t.ativo ? "Modelo desativado." : "Modelo ativado.");
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      {GRUPOS.map((g) => {
        const doGrupo = templates.filter((t) => t.destino === g.destino);
        if (doGrupo.length === 0) return null;
        return (
          <div key={g.destino} className="flex flex-col gap-2">
            <div>
              <h3 className="text-sm font-semibold text-ink">{g.titulo}</h3>
              <p className="text-xs text-ink-muted">{g.nota}</p>
            </div>
            <div className="flex flex-col gap-2">
              {doGrupo.map((t) => (
                <Card key={t.chave}>
                  <CardContent className="flex flex-wrap items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-medium text-ink">{t.rotulo}</h4>
                        {t.canais.map((c) => (
                          <CanalBadge key={c} canal={c} />
                        ))}
                        {t.personalizado ? (
                          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand">
                            Personalizado
                          </span>
                        ) : null}
                      </div>
                      {t.critico && !t.ativo ? (
                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-700 dark:text-amber-400">
                          <AlertTriangle className="size-3" />
                          Mensagem importante do fluxo — o locatário não será
                          avisado enquanto estiver desativada.
                        </p>
                      ) : null}
                    </div>

                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-4"
                        checked={t.ativo}
                        disabled={alternando === t.chave}
                        onChange={() => alternar(t)}
                      />
                      <span className="text-ink-muted">Ativo</span>
                    </label>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setEditando(t)}
                    >
                      <Pencil className="size-4" />
                      Editar
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        );
      })}

      {editando ? (
        <EditarDialog
          t={editando}
          aoFechar={() => setEditando(null)}
          aoSalvar={() => {
            setEditando(null);
            router.refresh();
          }}
        />
      ) : null}
    </div>
  );
}
