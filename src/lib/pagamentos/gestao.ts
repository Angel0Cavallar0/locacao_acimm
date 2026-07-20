import "server-only";
import { revalidatePath } from "next/cache";
import { requireColaborador } from "@/lib/auth/guards";
import { spWallParaUtc, utcParaNaiveSP } from "@/lib/calendario/tempo";
import { aplicarTransicao } from "@/lib/locacoes/maquina-estados";
import type { StatusLocacao } from "@/lib/locacoes/maquina-estados-core";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ehIsencao,
  type FormaPagamento,
  locacaoQuitada,
  podeRecompor,
  somaConfere,
  statusInicialItem,
  type StatusPagamento,
} from "./pagamentos-core";

export type ResultadoPagamento = { ok: true } | { erro: string };

type Admin = ReturnType<typeof createAdminClient>;

const BUCKET_COMPROVANTES = "comprovantes";

function revalidar(locacaoId: string) {
  revalidatePath(`/admin/locacoes/${locacaoId}`);
  revalidatePath("/admin/locacoes");
  revalidatePath("/admin/calendario");
  revalidatePath("/admin");
  revalidatePath(`/locacoes/${locacaoId}`);
  revalidatePath("/locacoes");
}

/** Data efetiva (YYYY-MM-DD, SP) → instante UTC ao meio-dia; vazio = agora. */
function baixaEmDe(dataEfetiva?: string): { utc: string } | { erro: string } {
  if (!dataEfetiva) return { utc: new Date().toISOString() };
  const hoje = utcParaNaiveSP(new Date().toISOString()).slice(0, 10);
  if (dataEfetiva > hoje) return { erro: "A data efetiva não pode ser futura." };
  return { utc: spWallParaUtc(dataEfetiva, "12:00") };
}

/** Insere um evento operacional (de = para; não muda o status). */
async function registrar(
  admin: Admin,
  locacaoId: string,
  status: StatusLocacao,
  autorUserId: string | null,
  observacao: string,
  tipo: string,
): Promise<void> {
  await admin.from("locacao_eventos").insert({
    locacao_id: locacaoId,
    de: status,
    para: status,
    autor_user_id: autorUserId,
    observacao,
    dados: { tipo },
  });
}

/**
 * Quitação total (§4): se todos os pagamentos vigentes estão quitados e a
 * locação ainda está em `aguardando_pagamento`, transiciona para `confirmada`
 * (autor Sistema). O CAS da RPC garante exatamente-uma-vez sob concorrência —
 * uma segunda chamada simultânea recebe "conflito" e é ignorada aqui.
 */
async function confirmarSeQuitada(
  admin: Admin,
  locacaoId: string,
): Promise<void> {
  const { data: loc } = await admin
    .from("locacoes")
    .select("status")
    .eq("id", locacaoId)
    .maybeSingle();
  if (!loc || loc.status !== "aguardando_pagamento") return;

  const { data: pags } = await admin
    .from("pagamentos")
    .select("status")
    .eq("locacao_id", locacaoId);
  const status = (pags ?? []).map((p) => p.status as StatusPagamento);
  if (!locacaoQuitada(status)) return;

  await aplicarTransicao({
    locacaoId,
    para: "confirmada",
    autorUserId: null,
  });
}

/**
 * Cria os pagamentos ao entrar em `aguardando_pagamento` (§3). Sem guard de
 * role — é chamado pelo efeito pós-transição (autor Sistema). Idempotente: se a
 * locação já tem qualquer pagamento, não recria.
 */
export async function criarPagamentosIniciais(locacaoId: string): Promise<void> {
  const admin = createAdminClient();

  const { data: loc } = await admin
    .from("locacoes")
    .select("status, valor_total_centavos, forma_pagamento_preferida")
    .eq("id", locacaoId)
    .maybeSingle();
  if (!loc) return;

  const { count } = await admin
    .from("pagamentos")
    .select("id", { count: "exact", head: true })
    .eq("locacao_id", locacaoId);
  if ((count ?? 0) > 0) return; // reentrada após estorno não duplica

  const status = loc.status as StatusLocacao;
  const total = loc.valor_total_centavos as number;
  const preferida =
    (loc.forma_pagamento_preferida as FormaPagamento | null) ?? null;

  if (ehIsencao(preferida, total)) {
    await admin.from("pagamentos").insert({
      locacao_id: locacaoId,
      descricao: "Locação completa",
      forma: "isento",
      valor_centavos: total,
      status: "isento",
    });
    await registrar(
      admin,
      locacaoId,
      status,
      null,
      "Locação isenta de pagamento",
      "pagamento_isento",
    );
    // Isenção não espera baixa de R$ 0 — confirma na sequência.
    await aplicarTransicao({ locacaoId, para: "confirmada", autorUserId: null });
    return;
  }

  await admin.from("pagamentos").insert({
    locacao_id: locacaoId,
    descricao: "Locação completa",
    forma: preferida ?? "pix",
    valor_centavos: total,
    status: "pendente",
  });
  await registrar(
    admin,
    locacaoId,
    status,
    null,
    "Instruções de pagamento disponíveis",
    "pagamento_criado",
  );

  // Notifica o locatário com as instruções por forma (Spec 15).
  const { notificarInstrucoesPagamento } = await import(
    "@/lib/notificacoes/eventos"
  );
  await notificarInstrucoesPagamento(locacaoId);
}

interface PagamentoRow {
  locacaoId: string;
  status: StatusPagamento;
  descricao: string;
  forma: FormaPagamento;
  valorCentavos: number;
  comprovanteUrl: string | null;
  locacaoStatus: StatusLocacao;
}

function um<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

async function carregarPagamento(
  admin: Admin,
  pagamentoId: string,
): Promise<PagamentoRow | null> {
  const { data } = await admin
    .from("pagamentos")
    .select(
      "locacao_id, status, descricao, forma, valor_centavos, comprovante_url, locacoes ( status )",
    )
    .eq("id", pagamentoId)
    .maybeSingle();
  if (!data) return null;
  const loc = um(data.locacoes as { status: StatusLocacao } | { status: StatusLocacao }[] | null);
  return {
    locacaoId: data.locacao_id as string,
    status: data.status as StatusPagamento,
    descricao: data.descricao as string,
    forma: data.forma as FormaPagamento,
    valorCentavos: data.valor_centavos as number,
    comprovanteUrl: (data.comprovante_url as string | null) ?? null,
    locacaoStatus: (loc?.status as StatusLocacao) ?? "aguardando_pagamento",
  };
}

/** Baixa manual de um pagamento (§4). Confirma a locação se quitar tudo. */
export async function darBaixaPagamento(input: {
  pagamentoId: string;
  dataEfetiva?: string;
  observacao?: string;
}): Promise<ResultadoPagamento> {
  const { user } = await requireColaborador();
  const admin = createAdminClient();

  const pag = await carregarPagamento(admin, input.pagamentoId);
  if (!pag) return { erro: "Pagamento não encontrado." };
  if (pag.status !== "pendente") {
    return { erro: "Só é possível dar baixa em pagamento pendente." };
  }

  const quando = baixaEmDe(input.dataEfetiva);
  if ("erro" in quando) return { erro: quando.erro };

  const patch: Record<string, unknown> = {
    status: "pago",
    baixa_por: user.id,
    baixa_em: quando.utc,
  };
  const obs = input.observacao?.trim();
  if (obs) patch.observacao = obs;

  const { error } = await admin
    .from("pagamentos")
    .update(patch)
    .eq("id", input.pagamentoId)
    .eq("status", "pendente"); // trava contra dupla baixa
  if (error) return { erro: "Não foi possível registrar a baixa." };

  await registrar(
    admin,
    pag.locacaoId,
    pag.locacaoStatus,
    user.id,
    `Pagamento baixado: ${pag.descricao}${obs ? ` — ${obs}` : ""}`,
    "pagamento_baixado",
  );

  await confirmarSeQuitada(admin, pag.locacaoId);
  revalidar(pag.locacaoId);
  return { ok: true };
}

/**
 * Estorna um pagamento pago (§4): marca o registro como `estornado` (preserva o
 * histórico) e cria um novo pendente equivalente. Não regride o status da
 * locação — a regressão é decisão humana (cancelamento).
 */
export async function estornarPagamento(input: {
  pagamentoId: string;
  motivo: string;
}): Promise<ResultadoPagamento> {
  const { user } = await requireColaborador();
  const admin = createAdminClient();

  const motivo = input.motivo.trim();
  if (motivo.length === 0) return { erro: "Informe o motivo do estorno." };

  const pag = await carregarPagamento(admin, input.pagamentoId);
  if (!pag) return { erro: "Pagamento não encontrado." };
  if (pag.status !== "pago") {
    return { erro: "Só é possível estornar pagamento já baixado." };
  }

  const { error } = await admin
    .from("pagamentos")
    .update({ status: "estornado", observacao: `Estornado: ${motivo}` })
    .eq("id", input.pagamentoId)
    .eq("status", "pago");
  if (error) return { erro: "Não foi possível estornar o pagamento." };

  // Substituto pendente equivalente (mesma descrição/forma/valor).
  const { error: insErr } = await admin.from("pagamentos").insert({
    locacao_id: pag.locacaoId,
    descricao: pag.descricao,
    forma: pag.forma,
    valor_centavos: pag.valorCentavos,
    status: "pendente",
  });
  if (insErr) return { erro: "Estorno registrado, mas falhou ao recriar o pendente." };

  await registrar(
    admin,
    pag.locacaoId,
    pag.locacaoStatus,
    user.id,
    `Pagamento estornado: ${pag.descricao} — ${motivo}`,
    "pagamento_estornado",
  );

  revalidar(pag.locacaoId);
  return { ok: true };
}

/**
 * Recompõe os registros de pagamento (divisão híbrida — §4). Só enquanto TODOS
 * pendentes e a locação em `aguardando_pagamento`; soma validada ao centavo.
 */
export async function recomporPagamentos(input: {
  locacaoId: string;
  itens: {
    descricao: string;
    forma: FormaPagamento;
    valorCentavos: number;
    observacao?: string;
  }[];
}): Promise<ResultadoPagamento> {
  const { user } = await requireColaborador();
  const admin = createAdminClient();

  const { data: loc } = await admin
    .from("locacoes")
    .select("status, valor_total_centavos")
    .eq("id", input.locacaoId)
    .maybeSingle();
  if (!loc) return { erro: "Locação não encontrada." };
  if (loc.status !== "aguardando_pagamento") {
    return { erro: "Os pagamentos só podem ser recompostos durante o aguardo." };
  }

  const { data: atuais } = await admin
    .from("pagamentos")
    .select("id, status, comprovante_url")
    .eq("locacao_id", input.locacaoId);
  const status = (atuais ?? []).map((p) => p.status as StatusPagamento);
  if (!podeRecompor(status)) {
    return {
      erro: "Estrutura congelada após a primeira baixa. Estorne para reabrir.",
    };
  }

  if (!somaConfere(input.itens.map((i) => i.valorCentavos), loc.valor_total_centavos)) {
    return { erro: "A soma dos pagamentos deve ser igual ao total da locação." };
  }

  // Remove os registros pendentes atuais e seus comprovantes (sem órfãos).
  const ids = (atuais ?? []).map((p) => p.id as string);
  const comprovantes = (atuais ?? [])
    .map((p) => p.comprovante_url as string | null)
    .filter((x): x is string => Boolean(x));
  if (ids.length > 0) {
    const { error: delErr } = await admin
      .from("pagamentos")
      .delete()
      .in("id", ids);
    if (delErr) return { erro: "Não foi possível recompor os pagamentos." };
    if (comprovantes.length > 0) {
      await admin.storage.from(BUCKET_COMPROVANTES).remove(comprovantes);
    }
  }

  const { error: insErr } = await admin.from("pagamentos").insert(
    input.itens.map((i) => ({
      locacao_id: input.locacaoId,
      descricao: i.descricao,
      forma: i.forma,
      valor_centavos: i.valorCentavos,
      status: statusInicialItem(i.forma),
      observacao: i.observacao?.trim() || null,
    })),
  );
  if (insErr) return { erro: "Não foi possível salvar os novos pagamentos." };

  await registrar(
    admin,
    input.locacaoId,
    loc.status as StatusLocacao,
    user.id,
    `Pagamentos recompostos (${input.itens.length} registro${input.itens.length > 1 ? "s" : ""})`,
    "pagamentos_recompostos",
  );

  // Recomposição totalmente isenta quita a locação.
  await confirmarSeQuitada(admin, input.locacaoId);
  revalidar(input.locacaoId);
  return { ok: true };
}
