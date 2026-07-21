import type { Metadata } from "next";
import Link from "next/link";
import { requireColaborador } from "@/lib/auth/guards";
import { parsearAdicionaisCoffee } from "@/lib/coffee/dados";
import { listarCombosAplicaveis } from "@/lib/locacoes/combos-dados";
import { obterHorariosPeriodos } from "@/lib/locacoes/horarios";
import type { CondicaoLocatario, PeriodoDia } from "@/lib/dominio";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { mascararDocumento, mascararTelefone } from "@/lib/utils/mascaras";
import { NovaLocacaoForm } from "./nova-locacao-form";
import type { AssociadoBusca } from "./tipos";

export const metadata: Metadata = { title: "Nova locação" };

const PERIODOS_VALIDOS: PeriodoDia[] = ["manha", "tarde", "noite", "dia_inteiro"];

function texto(v: string | string[] | undefined): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export default async function NovaLocacaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireColaborador();
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: salas }, { data: niveis }, { data: campos }, horarios, combos] =
    await Promise.all([
      supabase
        .from("salas")
        .select("id, nome, capacidade")
        .eq("ativa", true)
        .is("excluida_em", null)
        .order("ordem", { ascending: true }),
      supabase
        .from("coffee_niveis")
        .select("id, nome, adicionais")
        .eq("ativo", true)
        .order("ordem", { ascending: true }),
      supabase
        .from("campos_formulario")
        .select("id, rotulo, tipo, opcoes, obrigatorio")
        .eq("ativo", true)
        .order("ordem", { ascending: true }),
      obterHorariosPeriodos(),
      listarCombosAplicaveis(),
    ]);

  const periodoPrefill = texto(sp.periodo);

  // Conversão a partir da lista de espera (?fila={id}, Spec 19 §4): pré-preenche
  // sala/data e o locatário (associado da base ou externo da fila).
  type LocatarioPrefill = {
    condicao: CondicaoLocatario;
    associado: AssociadoBusca | null;
    nome: string;
    documento: string;
    email: string;
    telefone: string;
  };
  let filaId: string | null = null;
  let filaSalaId: string | null = null;
  let filaData: string | null = null;
  let locatario: LocatarioPrefill | null = null;

  const filaParam = texto(sp.fila);
  if (filaParam) {
    const admin = createAdminClient();
    const { data: fe } = await admin
      .from("lista_espera")
      .select(
        "id, sala_id, data, associado_id, nome, contato, convertido_locacao_id, arquivado_em",
      )
      .eq("id", filaParam)
      .maybeSingle();

    if (fe && !fe.convertido_locacao_id && !fe.arquivado_em) {
      filaId = fe.id as string;
      filaSalaId = (fe.sala_id as string | null) ?? null;
      filaData = fe.data as string;

      if (fe.associado_id) {
        const { data: a } = await admin
          .from("associados")
          .select(
            "id, nome, razao_social, documento, emails, telefone, celular, whatsapp, situacao",
          )
          .eq("id", fe.associado_id)
          .maybeSingle();
        if (a) {
          const associado: AssociadoBusca = {
            id: a.id as string,
            nome: a.nome as string,
            razaoSocial: (a.razao_social as string | null) ?? null,
            documento: (a.documento as string | null) ?? null,
            emails: (a.emails as string[] | null) ?? [],
            telefone:
              (a.whatsapp as string | null) ??
              (a.celular as string | null) ??
              (a.telefone as string | null) ??
              null,
            situacao: a.situacao as AssociadoBusca["situacao"],
          };
          locatario = {
            condicao: "associado",
            associado,
            nome: associado.razaoSocial ?? associado.nome,
            documento: mascararDocumento(associado.documento ?? ""),
            email: associado.emails[0] ?? "",
            telefone: mascararTelefone(associado.telefone ?? ""),
          };
        }
      }
      if (!locatario) {
        locatario = {
          condicao: "nao_associado",
          associado: null,
          nome: (fe.nome as string) ?? "",
          documento: "",
          email: "",
          telefone: mascararTelefone((fe.contato as string) ?? ""),
        };
      }
    }
  }

  const prefill = {
    salaId: filaSalaId ?? texto(sp.sala),
    data: filaData ?? texto(sp.data),
    periodo:
      periodoPrefill && PERIODOS_VALIDOS.includes(periodoPrefill as PeriodoDia)
        ? (periodoPrefill as PeriodoDia)
        : null,
    filaId,
    locatario,
  };

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        href="/admin/locacoes"
        className="mb-3 inline-block text-sm text-ink-muted hover:text-ink"
      >
        ← Locações
      </Link>
      <h2 className="mb-4 font-display text-lg font-semibold text-ink">
        Nova locação
      </h2>
      <NovaLocacaoForm
        salas={salas ?? []}
        niveis={(niveis ?? []).map((n) => ({
          id: n.id,
          nome: n.nome,
          adicionais: parsearAdicionaisCoffee(n.adicionais),
        }))}
        campos={(campos ?? []).map((c) => ({
          id: c.id,
          rotulo: c.rotulo,
          tipo: c.tipo,
          opcoes: (c.opcoes as string[]) ?? [],
          obrigatorio: c.obrigatorio,
        }))}
        horarios={horarios}
        prefill={prefill}
        combos={combos}
      />
    </div>
  );
}
