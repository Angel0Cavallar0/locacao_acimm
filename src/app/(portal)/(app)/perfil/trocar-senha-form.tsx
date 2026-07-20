"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { createClient } from "@/lib/supabase/client";
import { senhaAssociadoSchema } from "@/lib/validacoes/associado";

/**
 * Troca de senha do associado (Spec 12 §6). Reautentica com a senha atual
 * antes de aplicar a nova (a sessão viva não basta: confirma quem está trocando).
 */
export function TrocarSenhaForm({ emailLogin }: { emailLogin: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [senhaAtual, setSenhaAtual] = useState("");
  const [senha, setSenha] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);

    const parsed = senhaAssociadoSchema.safeParse({ senha, confirmacao });
    if (!parsed.success) {
      setErro(parsed.error.issues[0]?.message ?? "Senha inválida.");
      return;
    }
    if (!senhaAtual) {
      setErro("Informe a senha atual.");
      return;
    }

    setSalvando(true);
    // Reautentica com a senha atual.
    const { error: reauth } = await supabase.auth.signInWithPassword({
      email: emailLogin,
      password: senhaAtual,
    });
    if (reauth) {
      setSalvando(false);
      setErro("Senha atual incorreta.");
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: senha });
    setSalvando(false);
    if (error) {
      setErro("Não foi possível alterar a senha. Tente novamente.");
      return;
    }
    setSenhaAtual("");
    setSenha("");
    setConfirmacao("");
    toast.success("Senha alterada.");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="senha-atual">Senha atual</Label>
        <PasswordInput
          id="senha-atual"
          autoComplete="current-password"
          value={senhaAtual}
          onChange={(e) => setSenhaAtual(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="senha-nova">Nova senha</Label>
        <PasswordInput
          id="senha-nova"
          autoComplete="new-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
        <p className="text-xs text-ink-muted">Mínimo de 10 caracteres.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="senha-conf">Confirmar nova senha</Label>
        <PasswordInput
          id="senha-conf"
          autoComplete="new-password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
        />
      </div>
      {erro ? (
        <p role="alert" className="text-sm text-destructive">
          {erro}
        </p>
      ) : null}
      <Button type="submit" loading={salvando} className="self-start">
        Salvar nova senha
      </Button>
    </form>
  );
}
