"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mascararDocumento } from "@/lib/utils/mascaras";
import {
  criarConta,
  enviarCodigo,
  iniciarCadastro,
  type OpcaoAssociado,
  verificarCodigo,
} from "./actions";

type Etapa =
  | { nome: "documento" }
  | { nome: "selecionar"; opcoes: OpcaoAssociado[] }
  | { nome: "codigo"; emailsMascarados: string[] }
  | { nome: "conta"; emails: string[]; prova: string };

const inputClasses =
  "h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function forcaSenha(senha: string): { pct: number; rotulo: string } {
  let score = 0;
  if (senha.length >= 10) score++;
  if (senha.length >= 14) score++;
  if (/[A-Z]/.test(senha) && /[a-z]/.test(senha)) score++;
  if (/\d/.test(senha)) score++;
  if (/[^A-Za-z0-9]/.test(senha)) score++;
  const pct = Math.min(100, (score / 5) * 100);
  return { pct, rotulo: pct >= 80 ? "Forte" : pct >= 40 ? "Média" : "Fraca" };
}

export function CadastroClient() {
  const [etapa, setEtapa] = useState<Etapa>({ nome: "documento" });
  const [documento, setDocumento] = useState("");
  const [associadoId, setAssociadoId] = useState("");
  const [codigo, setCodigo] = useState("");
  const [emailLogin, setEmailLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [jaConta, setJaConta] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function disparar(id: string) {
    setCarregando(true);
    setErro(null);
    const r = await enviarCodigo({ associadoId: id, documento });
    setCarregando(false);
    if (r.erro) {
      setErro(r.erro);
      return;
    }
    setAssociadoId(id);
    setCodigo("");
    setCooldown(60);
    setEtapa({ nome: "codigo", emailsMascarados: r.emailsMascarados ?? [] });
  }

  async function onDocumento(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setJaConta(false);
    setCarregando(true);
    const r = await iniciarCadastro(documento);
    setCarregando(false);
    if (r.status === "nao_encontrado") {
      setErro(
        "Não encontramos cadastro ativo para este documento. Entre em contato com a ACIMM.",
      );
    } else if (r.status === "ja_conta") {
      setJaConta(true);
    } else if (r.status === "erro") {
      setErro(r.mensagem);
    } else if (r.status === "selecionar") {
      setEtapa({ nome: "selecionar", opcoes: r.opcoes });
    } else if (r.status === "enviar") {
      await disparar(r.opcao.id);
    }
  }

  async function onVerificar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const r = await verificarCodigo({ associadoId, documento, codigo });
    setCarregando(false);
    if (r.erro) {
      setErro(r.erro);
      return;
    }
    const emails = r.emails ?? [];
    setEmailLogin(emails[0] ?? "");
    setEtapa({ nome: "conta", emails, prova: r.prova ?? "" });
  }

  async function onCriar(e: React.FormEvent) {
    e.preventDefault();
    if (etapa.nome !== "conta") return;
    setErro(null);
    setCarregando(true);
    const r = await criarConta({
      associadoId,
      documento,
      prova: etapa.prova,
      emailLogin,
      senha,
      confirmacao,
    });
    setCarregando(false);
    // Sucesso redireciona no servidor; só tratamos erro.
    if (r?.erro) setErro(r.erro);
  }

  const forca = forcaSenha(senha);

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div>
          <h1 className="font-display text-lg font-semibold text-ink">
            Primeiro acesso
          </h1>
          <p className="text-sm text-ink-muted">
            {etapa.nome === "documento" && "Informe seu CNPJ ou CPF para começar."}
            {etapa.nome === "selecionar" && "Selecione o seu cadastro."}
            {etapa.nome === "codigo" && "Digite o código enviado ao seu e-mail."}
            {etapa.nome === "conta" && "Defina o e-mail de acesso e a senha."}
          </p>
        </div>

        {/* Etapa 1 — Documento */}
        {etapa.nome === "documento" ? (
          <form onSubmit={onDocumento} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="doc">CNPJ ou CPF</Label>
              <Input
                id="doc"
                inputMode="numeric"
                value={documento}
                onChange={(e) => setDocumento(mascararDocumento(e.target.value))}
                placeholder="00.000.000/0000-00"
                required
                autoFocus
              />
            </div>
            {jaConta ? (
              <p className="text-sm text-ink">
                Este cadastro já possui conta.{" "}
                <Link href="/login" className="text-brand hover:underline">
                  Entrar
                </Link>{" "}
                ou{" "}
                <Link
                  href="/recuperar-senha"
                  className="text-brand hover:underline"
                >
                  recuperar a senha
                </Link>
                .
              </p>
            ) : null}
            {erro ? (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            ) : null}
            <Button type="submit" className="w-full" loading={carregando}>
              Continuar
            </Button>
            <p className="text-center text-sm text-ink-muted">
              Já tem conta?{" "}
              <Link href="/login" className="text-brand hover:underline">
                Entrar
              </Link>
            </p>
          </form>
        ) : null}

        {/* Etapa 1b — Selecionar cadastro (duplicatas) */}
        {etapa.nome === "selecionar" ? (
          <div className="flex flex-col gap-2">
            {etapa.opcoes.map((o) => (
              <button
                key={o.id}
                type="button"
                disabled={carregando}
                onClick={() => disparar(o.id)}
                className="flex flex-col items-start rounded-lg border px-3 py-2 text-left hover:bg-surface-muted disabled:opacity-60"
              >
                <span className="text-sm font-medium text-ink">{o.rotulo}</span>
                <span className="text-xs text-ink-muted">
                  {o.emailsMascarados.join(" · ")}
                </span>
              </button>
            ))}
            {erro ? (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            ) : null}
          </div>
        ) : null}

        {/* Etapa 2/3 — Código */}
        {etapa.nome === "codigo" ? (
          <form onSubmit={onVerificar} className="flex flex-col gap-4" noValidate>
            <p className="text-sm text-ink-muted">
              Enviamos um código para: {etapa.emailsMascarados.join(", ")}
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="codigo">Código de 6 dígitos</Label>
              <Input
                id="codigo"
                inputMode="numeric"
                maxLength={6}
                value={codigo}
                onChange={(e) =>
                  setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                placeholder="000000"
                className="text-center text-lg tracking-[0.4em]"
                required
                autoFocus
              />
            </div>
            {erro ? (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            ) : null}
            <Button type="submit" className="w-full" loading={carregando}>
              Verificar
            </Button>
            <button
              type="button"
              disabled={cooldown > 0 || carregando}
              onClick={() => disparar(associadoId)}
              className="text-center text-sm text-brand hover:underline disabled:text-ink-muted disabled:no-underline"
            >
              {cooldown > 0
                ? `Reenviar código em ${cooldown}s`
                : "Reenviar código"}
            </button>
          </form>
        ) : null}

        {/* Etapa 4 — Conta */}
        {etapa.nome === "conta" ? (
          <form onSubmit={onCriar} className="flex flex-col gap-4" noValidate>
            {etapa.emails.length > 1 ? (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="email-login">E-mail de acesso</Label>
                <select
                  id="email-login"
                  className={inputClasses}
                  value={emailLogin}
                  onChange={(e) => setEmailLogin(e.target.value)}
                >
                  {etapa.emails.map((em) => (
                    <option key={em} value={em}>
                      {em}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <p className="text-sm text-ink-muted">
                E-mail de acesso: <span className="text-ink">{emailLogin}</span>
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                autoComplete="new-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
              />
              {senha.length > 0 ? (
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1 flex-1 overflow-hidden rounded bg-surface-muted">
                    <div
                      className="h-full bg-brand transition-all"
                      style={{ width: `${forca.pct}%` }}
                    />
                  </div>
                  <span className="text-xs text-ink-muted">{forca.rotulo}</span>
                </div>
              ) : (
                <p className="text-xs text-ink-muted">Mínimo de 10 caracteres.</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="conf">Confirmar senha</Label>
              <Input
                id="conf"
                type="password"
                autoComplete="new-password"
                value={confirmacao}
                onChange={(e) => setConfirmacao(e.target.value)}
                required
              />
            </div>

            {erro ? (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            ) : null}
            <Button type="submit" className="w-full" loading={carregando}>
              Criar conta e entrar
            </Button>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
