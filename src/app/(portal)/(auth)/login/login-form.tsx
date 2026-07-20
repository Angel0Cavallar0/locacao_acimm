"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { mascararDocumento } from "@/lib/utils/mascaras";
import { type EstadoLoginAssociado, loginAssociado } from "../actions";

export function LoginAssociadoForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<
    EstadoLoginAssociado,
    FormData
  >(loginAssociado, {});
  const [documento, setDocumento] = useState("");

  return (
    <Card>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4" noValidate>
          <input type="hidden" name="next" value={next} />

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="documento">CNPJ ou CPF</Label>
            <Input
              id="documento"
              name="documento"
              inputMode="numeric"
              autoComplete="username"
              value={documento}
              onChange={(e) => setDocumento(mascararDocumento(e.target.value))}
              placeholder="00.000.000/0000-00"
              required
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="senha">Senha</Label>
              <Link
                href="/recuperar-senha"
                className="text-xs text-ink-muted underline-offset-4 hover:underline"
              >
                Esqueci minha senha
              </Link>
            </div>
            <Input
              id="senha"
              name="senha"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>

          {state.error ? (
            <p
              role="alert"
              className="text-sm text-destructive"
              aria-live="polite"
            >
              {state.error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" loading={pending}>
            Entrar
          </Button>

          <p className="text-center text-sm text-ink-muted">
            Primeiro acesso?{" "}
            <Link
              href="/cadastro"
              className="text-brand underline-offset-4 hover:underline"
            >
              Criar conta
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
