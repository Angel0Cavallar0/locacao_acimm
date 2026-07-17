import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { requireColaborador } from "@/lib/auth/guards";
import { parseDaterange } from "@/lib/precos/resolver-core";
import { urlFotoSala } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { FotoGaleria } from "../foto-galeria";
import { PrecosGrade, type PrecoVM } from "../precos-grade";
import { SalaForm } from "../sala-form";

export const metadata: Metadata = { title: "Editar sala" };

export default async function EditarSalaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireColaborador();
  const { id } = await params;
  const supabase = await createClient();

  const { data: sala } = await supabase
    .from("salas")
    .select("id, nome, descricao, capacidade, equipamentos, ativa, fotos")
    .eq("id", id)
    .maybeSingle();
  if (!sala) notFound();

  const { data: precos } = await supabase
    .from("precos_sala")
    .select("id, condicao, periodo, dias_semana, valor_centavos, vigencia")
    .eq("sala_id", id);

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
        </TabsList>

        <TabsContent value="dados" className="mt-4">
          <SalaForm
            modo="editar"
            sala={{
              id: sala.id,
              nome: sala.nome,
              descricao: sala.descricao ?? "",
              capacidade: sala.capacidade,
              equipamentos: (sala.equipamentos as string[] | null) ?? [],
              ativa: sala.ativa,
            }}
          />
        </TabsContent>

        <TabsContent value="fotos" className="mt-4">
          <FotoGaleria salaId={sala.id} fotosIniciais={fotos} />
        </TabsContent>

        <TabsContent value="precos" className="mt-4">
          <PrecosGrade salaId={sala.id} precos={precosVM} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
