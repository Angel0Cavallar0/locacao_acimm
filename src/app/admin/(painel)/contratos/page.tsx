import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { requireColaborador } from "@/lib/auth/guards";
import { dataSP, horaSP } from "@/lib/calendario/tempo";
import { parsearModoEnvio } from "@/lib/contratos/tipos";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import { ContratosClient, type ContratoLinha } from "./contratos-client";

export const metadata: Metadata = { title: "Contratos" };

const FILTROS = [
  { valor: "", rotulo: "Todos" },
  { valor: "pendente", rotulo: "Pendentes" },
  { valor: "enviado", rotulo: "Enviados" },
  { valor: "assinado", rotulo: "Assinados" },
  { valor: "recusado", rotulo: "Recusados" },
] as const;

const MODO_ROTULO: Record<string, string> = {
  email: "E-mail",
  autentique: "Assinatura digital (Autentique)",
};

function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireColaborador();
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";

  const admin = createAdminClient();

  let q = admin
    .from("contratos")
    .select(
      "locacao_id, status, enviado_em, assinado_em, pdf_url, criado_em, locacoes ( numero, locatario_nome, inicio, status )",
    )
    .order("criado_em", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);

  const [{ data: rows }, { data: cfg }] = await Promise.all([
    q,
    admin
      .from("configuracoes")
      .select("valor")
      .eq("chave", "modo_envio_contrato")
      .maybeSingle(),
  ]);
  const modo = parsearModoEnvio(cfg?.valor);

  const contratos: ContratoLinha[] = (
    (rows ?? []) as Array<{
      locacao_id: string;
      status: string;
      enviado_em: string | null;
      assinado_em: string | null;
      pdf_url: string | null;
      locacoes:
        | { numero: number; locatario_nome: string; inicio: string; status: string }
        | { numero: number; locatario_nome: string; inicio: string; status: string }[]
        | null;
    }>
  ).map((r) => {
    const l = um(r.locacoes);
    return {
      locacaoId: r.locacao_id,
      numero: l?.numero ?? 0,
      locatario: l?.locatario_nome ?? "—",
      dataEvento: l ? `${dataSP(l.inicio)} · ${horaSP(l.inicio)}` : "—",
      statusContrato: r.status,
      temPdf: Boolean(r.pdf_url),
      enviadoEm: r.enviado_em ? dataSP(r.enviado_em) : null,
      assinadoEm: r.assinado_em ? dataSP(r.assinado_em) : null,
    };
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Contratos
          </h2>
          <p className="text-sm text-ink-muted">
            Modo de envio atual: <strong>{MODO_ROTULO[modo]}</strong>. Altere em
            Configurações.
          </p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {FILTROS.map((f) => (
          <Link
            key={f.valor || "todos"}
            href={f.valor ? `/admin/contratos?status=${f.valor}` : "/admin/contratos"}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors",
              status === f.valor
                ? "border-brand bg-brand/10 text-brand"
                : "text-ink-muted hover:text-ink",
            )}
          >
            {f.rotulo}
          </Link>
        ))}
      </div>

      {contratos.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-ink-muted">
            Nenhum contrato neste filtro. Contratos são gerados ao aprovar uma
            locação.
          </CardContent>
        </Card>
      ) : (
        <ContratosClient contratos={contratos} />
      )}
    </div>
  );
}
