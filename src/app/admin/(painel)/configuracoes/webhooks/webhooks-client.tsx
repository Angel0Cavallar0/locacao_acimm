"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { salvarWebhookAssociadosAction } from "./actions";

export function WebhooksClient({ urlInicial }: { urlInicial: string }) {
  const [url, setUrl] = useState(urlInicial);
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    setSalvando(true);
    const r = await salvarWebhookAssociadosAction(url);
    setSalvando(false);
    if (r.error) {
      toast.error(r.error);
      return;
    }
    toast.success("Webhook salvo.");
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">
            Sincronização de associados
          </h3>
          <p className="text-xs text-ink-muted">
            URL do webhook que dispara a atualização da base de associados. Em
            branco, o botão de sincronizar fica indisponível.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="webhook-url">URL do webhook</Label>
          <Input
            id="webhook-url"
            type="url"
            inputMode="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
          />
        </div>

        <div>
          <Button size="sm" loading={salvando} onClick={salvar}>
            Salvar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
