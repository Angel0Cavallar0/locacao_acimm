import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { requireColaborador } from "@/lib/auth/guards";
import { parseDaterange } from "@/lib/precos/resolver-core";
import { urlFotoSala } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { centavosParaBRL } from "@/lib/utils/moeda";
import type { CategoriaHoraAdicional } from "@/lib/dominio";
import { listarEquipamentos } from "../equipamentos-actions";
import { ExcluirSalaButton } from "../excluir-sala-button";
import { FotoGaleria } from "../foto-galeria";
import {
  HoraAdicionalForm,
  type ValorHoraAdicional,
} from "../hora-adicional-form";
import { PrecosGrade, type PrecoVM } from "../precos-grade";
import { SalaForm } from "../sala-form";

export const metadata: Metadata = { title: "Editar sala" };

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  solicitada: "Solicitada",
  em_analise: "Em análise",
  aprovada: "Aprovada",
  contrato_enviado: "Contrato enviado",
  contrato_assinado: "Contrato assinado",
  aguardando_pagamento: "Aguardando pagamento",
  confirmada: "Confirmada",
  realizada: "Realizada",
  finalizada: "Finalizada",
  recusada: "Recusada",
  cancelada: "Cancelada",
};

interface HistLinha {
  locacoes: {
    numero: number;
    locatario_nome: string;
    inicio: string;
    fim: string;
    status: string;
    valor_total_centavos: number;
  } | null;
}

export default async function EditarSalaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { colaborador } = await requireColaborador();
  const { id } = await params;
  const supabase = await createClient();

  const [
    { data: sala },
    { data: precos },
    { data: histRaw },
    { data: haRows },
    catalogo,
  ] = await Promise.all([
    supabase
      .from("salas")
      .select(
        "id, nome, descricao, capacidade, equipamentos, ativa, fotos, hora_adicional_minutos",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("precos_sala")
      .select("id, condicao, periodo, dias_semana, valor_centavos, vigencia")
      .eq("sala_id", id),
    supabase
      .from("locacao_salas")
      .select(
        "locacoes!inner(numero, locatario_nome, inicio, fim, status, valor_total_centavos)",
      )
      .eq("sala_id", id),
    supabase
      .from("precos_hora_adicional")
      .select("condicao, categoria, valor_centavos")
      .eq("sala_id", id),
    listarEquipamentos(),
  ]);

  if (!sala) notFound();

  const haVM: ValorHoraAdicional[] = (haRows ?? []).map((r) => ({
    condicao: r.condicao,
    categoria: r.categoria as CategoriaHoraAdicional,
    valorCentavos: r.valor_centavos,
  }));

  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date());

  const precosVM: PrecoVM[] = (precos ?? []).map((p) => {
    const { inicio, fim } = parseDaterange(String(p.vigencia));
    return {
      id: p.id,
      condicao: p.condicao,
      periodo: p.periodo,
      diasSemana: (p.dias_semana as number[]) ?? [],
      valorCentavos: p.valor_centavos,
      vigenciaInicio: inicio,
      vigenciaFim: fim,
      vigente: (inicio === null || hoje >= inicio) && (fim === null || hoje < fim),
    };
  });

  const fotos = ((sala.fotos as string[] | null) ?? []).map((path) => ({
    path,
    url: urlFotoSala(path),
  }));

  const historico = ((histRaw ?? []) as unknown as HistLinha[])
    .map((h) => h.locacoes)
    .filter((l): l is NonNullable<HistLinha["locacoes"]> => l !== null)
    .sort((a, b) => b.inicio.localeCompare(a.inicio));

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin/salas"
        className={buttonVariants({ variant: "ghost", size: "sm" })}
      >
        <ArrowLeft className="size-4" />
        Salas
      </Link>
      <h2 className="mt-2 mb-4 font-display text-lg font-semibold text-ink">
        {sala.nome}
      </h2>

      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="fotos">Fotos ({fotos.length})</TabsTrigger>
          <TabsTrigger value="precos">Preços</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
        </TabsList>

        <TabsContent value="dados" className="mt-4">
          <div className="flex flex-col gap-4">
            <SalaForm
              modo="editar"
              catalogo={catalogo}
              sala={{
                id: sala.id,
                nome: sala.nome,
                descricao: sala.descricao ?? "",
                capacidade: sala.capacidade,
                equipamentos: (sala.equipamentos as string[] | null) ?? [],
                ativa: sala.ativa,
              }}
            />
            {colaborador.role === "admin" ? (
              <ExcluirSalaButton salaId={sala.id} nome={sala.nome} />
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="fotos" className="mt-4">
          <FotoGaleria salaId={sala.id} fotosIniciais={fotos} />
        </TabsContent>

        <TabsContent value="precos" className="mt-4">
          <div className="flex flex-col gap-4">
            <PrecosGrade salaId={sala.id} precos={precosVM} />
            <HoraAdicionalForm
              salaId={sala.id}
              minutosIniciais={sala.hora_adicional_minutos ?? null}
              valoresIniciais={haVM}
            />
          </div>
        </TabsContent>

        <TabsContent value="historico" className="mt-4">
          <Card>
            <CardContent>
              {historico.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-muted">
                  Nenhuma locação registrada para esta sala.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nº</TableHead>
                        <TableHead>Locatário</TableHead>
                        <TableHead>Data</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historico.map((l) => (
                        <TableRow key={l.numero}>
                          <TableCell className="font-medium text-ink">
                            LOC-{String(l.numero).padStart(6, "0")}
                          </TableCell>
                          <TableCell className="text-ink-muted">
                            {l.locatario_nome}
                          </TableCell>
                          <TableCell className="text-ink-muted">
                            {new Date(l.inicio).toLocaleDateString("pt-BR")}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {STATUS_LABEL[l.status] ?? l.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right text-ink-muted">
                            {centavosParaBRL(l.valor_total_centavos)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
