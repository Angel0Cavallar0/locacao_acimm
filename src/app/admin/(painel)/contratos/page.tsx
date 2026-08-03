import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { requireColaborador } from "@/lib/auth/guards";
import { dataSP, horaSP, spWallParaUtc } from "@/lib/calendario/tempo";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";
import { ContratosClient, type ContratoLinha } from "./contratos-client";
import { ContratosFiltros } from "./contratos-filtros";

export const metadata: Metadata = { title: "Contratos" };
export const dynamic = "force-dynamic";

const FILTROS = [
  { valor: "", rotulo: "Todos" },
  { valor: "pendente", rotulo: "Pendentes" },
  { valor: "enviado", rotulo: "Enviados" },
  { valor: "assinado", rotulo: "Assinados" },
  { valor: "recusado", rotulo: "Recusados" },
] as const;

function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function texto(v: string | string[] | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

export default async function ContratosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireColaborador();
  const sp = await searchParams;
  const status = texto(sp.status);
  const busca = texto(sp.q);
  const de = texto(sp.de);
  const ate = texto(sp.ate);

  const admin = createAdminClient();

  // Filtro por associado/nº e período resolve ids de locação (embedding não
  // filtra bem por campos do relacionado).
  let idsFiltro: string[] | null = null;
  if (busca || de || ate) {
    let lq = admin.from("locacoes").select("id");
    if (busca) {
      const b = busca.replace(/[,()]/g, " ");
      const ors = [
        `locatario_nome.ilike.%${b}%`,
        `locatario_documento.ilike.%${b}%`,
      ];
      const num = Number.parseInt(b.replace(/\D/g, ""), 10);
      if (!Number.isNaN(num)) ors.push(`numero.eq.${num}`);
      lq = lq.or(ors.join(","));
    }
    if (de) lq = lq.gte("inicio", spWallParaUtc(de, "00:00"));
    if (ate) lq = lq.lte("inicio", spWallParaUtc(ate, "23:59"));
    const { data: locs } = await lq.limit(1000);
    idsFiltro = ((locs ?? []) as { id: string }[]).map((r) => r.id);
    if (idsFiltro.length === 0) {
      idsFiltro = ["00000000-0000-0000-0000-000000000000"];
    }
  }

  let q = admin
    .from("contratos")
    .select(
      "locacao_id, status, enviado_em, assinado_em, pdf_url, criado_em, locacoes ( numero, locatario_nome, inicio, status )",
    )
    .order("criado_em", { ascending: false })
    .limit(200);
  if (status) q = q.eq("status", status);
  if (idsFiltro) q = q.in("locacao_id", idsFiltro);

  const { data: rows } = await q;

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

  const paramsAtuais: Record<string, string> = {};
  for (const [k, v] of Object.entries(sp)) {
    if (typeof v === "string" && v.length > 0) paramsAtuais[k] = v;
  }
  function hrefStatus(valor: string): string {
    const p = new URLSearchParams(paramsAtuais);
    if (valor) p.set("status", valor);
    else p.delete("status");
    const qs = p.toString();
    return qs ? `/admin/contratos?${qs}` : "/admin/contratos";
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-semibold text-ink">
            Contratos
          </h2>
          <p className="text-sm text-ink-muted">
            Enviados por WhatsApp ao locatário; a via assinada volta pela
            plataforma.
          </p>
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto">
        {FILTROS.map((f) => (
          <Link
            key={f.valor || "todos"}
            href={hrefStatus(f.valor)}
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

      <ContratosFiltros params={paramsAtuais} />

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
