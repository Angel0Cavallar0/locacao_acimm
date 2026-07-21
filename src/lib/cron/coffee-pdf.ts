import "server-only";
import { carregarPedidosCoffee } from "@/lib/coffee/dados";
import { gerarPdfCompras } from "@/lib/coffee/pdf-compras";
import { hojeSP, intervaloSemana } from "@/lib/coffee/periodo";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PDF semanal de compras do coffee (Spec 16 §4.3). Gera o consolidado da SEMANA
 * corrente (seg–dom), guarda no bucket privado `coffee-pdfs` e enfileira o envio
 * como documento ao WhatsApp de compras. Idempotente: dedupe pela notificação da
 * semana; sem pedidos firmes → não gera; sem número → skip logado.
 */

const BUCKET = "coffee-pdfs";

export interface ResultadoCoffeePdf {
  gerado: boolean;
  enviado: boolean;
  motivo?: string;
}

export async function processarCoffeePdf(): Promise<ResultadoCoffeePdf> {
  const admin = createAdminClient();
  const intervalo = intervaloSemana(hojeSP());
  const semana = intervalo.inicioData; // segunda-feira da semana (chave)

  // Dedupe: já há notificação do PDF desta semana? (reexecução não duplica)
  const { count } = await admin
    .from("notificacoes")
    .select("id", { count: "exact", head: true })
    .eq("template", "coffee_pdf")
    .contains("payload", { semana });
  if ((count ?? 0) > 0) {
    return { gerado: false, enviado: false, motivo: "PDF da semana já processado." };
  }

  // Sem pedidos firmes → não gera PDF vazio.
  const { consolidado } = await carregarPedidosCoffee(intervalo, false);
  if (consolidado.qtdPedidos === 0) {
    return { gerado: false, enviado: false, motivo: "Sem pedidos firmes na semana." };
  }

  const pdf = await gerarPdfCompras(intervalo, {
    subtitulo: `Semana ${intervalo.rotulo}`,
  });
  const path = `semana-${semana}.pdf`;
  const up = await admin.storage.from(BUCKET).upload(path, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up.error) {
    return { gerado: false, enviado: false, motivo: "Falha ao salvar o PDF." };
  }

  const { enfileirarCoffeePdf } = await import("@/lib/notificacoes/eventos");
  const enviado = await enfileirarCoffeePdf({
    path,
    semana,
    rotulo: intervalo.rotulo,
    qtd: consolidado.qtdPedidos,
  });
  return {
    gerado: true,
    enviado,
    motivo: enviado ? undefined : "WhatsApp de compras não configurado.",
  };
}
