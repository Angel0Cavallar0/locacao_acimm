import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ModeloCobranca } from "./tipos";

/**
 * Recálculo server-side dos adicionais do catálogo (Spec 30 §2.4 / §8.4.3).
 * O preço NUNCA vem do client: para itens do catálogo o valor é o cadastrado
 * (exceto `sob_consulta`, cujo valor é a cotação digitada pela equipe). Valida
 * disponibilidade por sala e os modelos de cobrança.
 */

export interface AdicionalEntrada {
  servicoAdicionalId?: string | null;
  descricao?: string;
  quantidade: number;
  valorUnitarioCentavos?: number;
}

export interface AdicionalResolvido {
  servicoAdicionalId: string | null;
  descricao: string;
  quantidade: number;
  valorUnitarioCentavos: number;
}

export type ResultadoResolver =
  | { ok: true; itens: AdicionalResolvido[] }
  | { ok: false; erro: string };

interface CatalogoRow {
  id: string;
  nome: string;
  modelo_cobranca: ModeloCobranca;
  valor_unitario_centavos: number | null;
  sala_id: string | null;
  ativo: boolean;
  excluido_em: string | null;
}

export async function resolverAdicionais(
  salaIds: string[],
  entradas: AdicionalEntrada[],
  opts: { permitirTextoLivre: boolean; permitirSobConsulta: boolean },
): Promise<ResultadoResolver> {
  if (entradas.length === 0) return { ok: true, itens: [] };

  const ids = [
    ...new Set(
      entradas
        .map((e) => e.servicoAdicionalId)
        .filter((v): v is string => Boolean(v)),
    ),
  ];

  const catalogo = new Map<string, CatalogoRow>();
  if (ids.length > 0) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("servicos_adicionais")
      .select(
        "id, nome, modelo_cobranca, valor_unitario_centavos, sala_id, ativo, excluido_em",
      )
      .in("id", ids);
    for (const r of (data ?? []) as CatalogoRow[]) catalogo.set(r.id, r);
  }

  const itens: AdicionalResolvido[] = [];
  for (const e of entradas) {
    if (e.servicoAdicionalId) {
      const sv = catalogo.get(e.servicoAdicionalId);
      if (!sv || !sv.ativo || sv.excluido_em) {
        return { ok: false, erro: "Serviço adicional indisponível." };
      }
      if (sv.sala_id && !salaIds.includes(sv.sala_id)) {
        return { ok: false, erro: `O serviço "${sv.nome}" é exclusivo de outra sala.` };
      }
      const modelo = sv.modelo_cobranca;
      if (modelo === "sob_consulta") {
        if (!opts.permitirSobConsulta) {
          return {
            ok: false,
            erro: `O serviço "${sv.nome}" é sob consulta — solicite à equipe da ACIMM.`,
          };
        }
        const v = e.valorUnitarioCentavos ?? -1;
        if (v < 0) {
          return { ok: false, erro: `Informe o valor cotado de "${sv.nome}".` };
        }
        itens.push({
          servicoAdicionalId: sv.id,
          descricao: sv.nome,
          quantidade: 1,
          valorUnitarioCentavos: Math.round(v),
        });
      } else if (modelo === "por_unidade") {
        const q = e.quantidade > 0 ? e.quantidade : 0;
        if (q <= 0) {
          return { ok: false, erro: `Informe a quantidade de "${sv.nome}".` };
        }
        itens.push({
          servicoAdicionalId: sv.id,
          descricao: sv.nome,
          quantidade: q,
          valorUnitarioCentavos: sv.valor_unitario_centavos ?? 0,
        });
      } else {
        // fixo_evento
        itens.push({
          servicoAdicionalId: sv.id,
          descricao: sv.nome,
          quantidade: 1,
          valorUnitarioCentavos: sv.valor_unitario_centavos ?? 0,
        });
      }
    } else {
      if (!opts.permitirTextoLivre) {
        return { ok: false, erro: "Adicional inválido." };
      }
      const desc = (e.descricao ?? "").trim();
      if (!desc) {
        return { ok: false, erro: "Informe a descrição do adicional." };
      }
      itens.push({
        servicoAdicionalId: null,
        descricao: desc,
        quantidade: e.quantidade > 0 ? e.quantidade : 1,
        valorUnitarioCentavos: Math.round(e.valorUnitarioCentavos ?? 0),
      });
    }
  }
  return { ok: true, itens };
}
