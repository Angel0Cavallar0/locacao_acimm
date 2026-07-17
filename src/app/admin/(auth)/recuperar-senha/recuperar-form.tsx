"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type EstadoRecuperar, recuperarSenha } from "../actions";

export function RecuperarForm() {
  const [state, formAction, pending] = useActionState<
    EstadoRecuperar,
    FormData
  >(recuperarSenha, {});

  return (
    <Card>
      <CardContent>
        {state.message ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-sm text-ink" aria-live="polite">
              {state.message}
            </p>
            <Link
              href="/admin/login"
              className="text-sm text-brand underline-offset-4 hover:underline"
            >
              Voltar ao login
            </Link>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-4" noValidate>
            <p className="text-sm text-ink-muted">
              Informe seu e-mail e enviaremos as instruções para redefinir a
              senha.
            </p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
              />
            </div>
            <Button type="submit" className="w-full" loading={pending}>
              Enviar instruções
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
