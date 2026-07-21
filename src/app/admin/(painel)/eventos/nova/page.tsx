import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { requireColaborador } from "@/lib/auth/guards";
import { utcParaNaiveSP } from "@/lib/calendario/tempo";
import { isSymplaConfigured } from "@/lib/integracoes/sympla";
import { createAdminClient } from "@/lib/supabase/admin";
import { EventoForm } from "../evento-form";

export const metadata: Metadata = { title: "Novo evento" };

export default async function NovoEventoPage() {
  await requireColaborador();
  const admin = createAdminClient();
  const { data: salas } = await admin
    .from("salas")
    .select("id, nome")
    .eq("ativa", true)
    .is("excluida_em", null)
    .order("ordem", { ascending: true });

  const hoje = utcParaNaiveSP(new Date().toISOString()).slice(0, 10);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/admin/eventos" className="text-sm text-ink-muted hover:text-ink">
        ← Eventos
      </Link>
      <h1 className="font-display text-lg font-semibold text-ink">Novo evento</h1>

      {(salas?.length ?? 0) === 0 ? (
        <p className="text-sm text-ink-muted">
          Cadastre uma sala ativa antes de criar eventos.
        </p>
      ) : (
        <Card>
          <CardContent>
            <EventoForm
              salas={salas ?? []}
              hoje={hoje}
              symplaConfigurado={isSymplaConfigured()}
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
