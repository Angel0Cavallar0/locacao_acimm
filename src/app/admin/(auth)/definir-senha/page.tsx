"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { createClient } from "@/lib/supabase/client";
import { definirSenhaSchema } from "@/lib/validacoes/auth";

type Estado = "verificando" | "pronto" | "invalido";

function forcaSenha(senha: string): { pct: number; rotulo: string } {
  let score = 0;
  if (senha.length >= 10) score++;
  if (senha.length >= 14) score++;
  if (/[A-Z]/.test(senha) && /[a-z]/.test(senha)) score++;
  if (/\d/.test(senha)) score++;
  if (/[^A-Za-z0-9]/.test(senha)) score++;
  const pct = Math.min(100, (score / 5) * 100);
  const rotulo = pct >= 80 ? "Forte" : pct >= 40 ? "Média" : "Fraca";
  return { pct, rotulo };
}

/**
 * Destino comum do convite e do reset (Spec 03 §3.3). A sessão temporária vem
 * do link (o client Supabase troca o code da URL por sessão em cookies —
 * nenhum token em localStorage). Também serve para o colaborador logado trocar
 * a própria senha.
 */
export default function DefinirSenhaPage() {
  const supabase = useMemo(() => createClient(), []);
  const [estado, setEstado] = useState<Estado>("verificando");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let ativo = true;
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (ativo && session) setEstado("pronto");
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!ativo) return;
      if (data.session) {
        setEstado("pronto");
        return;
      }
      // Aguarda a troca do code presente na URL antes de desistir.
      setTimeout(async () => {
        if (!ativo) return;
        const { data: d2 } = await supabase.auth.getSession();
        setEstado(d2.session ? "pronto" : "invalido");
      }, 1500);
    });

    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, [supabase]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    const parsed = definirSenhaSchema.safeParse({ senha, confirmacao });
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message ?? "Senha inválida.");
      return;
    }
    setSalvando(true);
    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) {
      setErro("Não foi possível salvar a senha. O link pode ter expirado.");
      return;
    }
    // Força navegação completa para o middleware reconhecer a nova sessão.
    window.location.assign("/admin");
  }

  const forca = forcaSenha(senha);

  return (
    <Card>
      <CardContent>
        {estado === "verificando" ? (
          <p className="text-center text-sm text-ink-muted">
            Verificando o link…
          </p>
        ) : estado === "invalido" ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-sm text-ink">
              Este link é inválido ou expirou.
            </p>
            <Link
              href="/admin/recuperar-senha"
              className="text-sm text-brand underline-offset-4 hover:underline"
            >
              Solicitar um novo link
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="senha">Nova senha</Label>
              <PasswordInput
                id="senha"
                autoComplete="new-password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                required
                autoFocus
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
              <Label htmlFor="confirmacao">Confirmar senha</Label>
              <PasswordInput
                id="confirmacao"
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

            <Button type="submit" className="w-full" loading={salvando}>
              Salvar senha
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
