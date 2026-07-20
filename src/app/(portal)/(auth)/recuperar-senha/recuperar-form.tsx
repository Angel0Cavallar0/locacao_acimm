"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type EstadoRecuperar, recuperarSenhaAssociado } from "../actions";

export function RecuperarAssociadoForm() {
  const [state, formAction, pending] = useActionState<EstadoRecuperar, FormData>(
    recuperarSenhaAssociado,
    {},
  );

  return (
    <Card>
      <CardContent>
        {state.message ? (
          <div className="flex flex-col gap-4 text-center">
            <p className="text-sm text-ink">{state.message}</p>
            <Link
              href="/login"
              className="text-sm text-brand underline-offset-4 hover:underline"
            >
              Voltar ao login
            </Link>
          </div>
        ) : (
          <form action={formAction} className="flex flex-col gap-4" noValidate>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">E-mail cadastrado</Label>
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
            <p className="text-center text-sm text-ink-muted">
              <Link
                href="/login"
                className="text-brand underline-offset-4 hover:underline"
              >
                Voltar ao login
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
