import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  Document,
  Image,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { dataSP, horaSP } from "@/lib/calendario/tempo";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { carregarPedidosCoffee } from "./dados";
import type { IntervaloCoffee } from "./periodo";
import { formatarQuantidade, type PedidoCoffee } from "./tipos";

/**
 * PDF consolidado de compras de coffee break (Spec 08 §5). `gerarPdfCompras`
 * é a função reutilizável — a tela `/admin/coffee` chama para download manual e
 * o cron semanal (Spec 16) chamará a mesma função. Inclui SEMPRE apenas
 * pedidos firmes (documento de compra não especula sobre pendentes).
 */

const AZUL = "#123B6D";
const CINZA = "#6b7280";
const BORDA = "#d1d5db";

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 44,
    paddingHorizontal: 36,
    fontSize: 10,
    color: "#111827",
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 2,
    borderBottomColor: AZUL,
    paddingBottom: 12,
    marginBottom: 16,
  },
  logo: { width: 52, height: 52, objectFit: "contain" },
  titulo: { fontSize: 15, fontFamily: "Helvetica-Bold", color: AZUL },
  subtitulo: { fontSize: 10, color: CINZA, marginTop: 2 },
  secaoTitulo: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: AZUL,
    marginTop: 8,
    marginBottom: 6,
  },
  resumoLinha: { fontSize: 9, color: CINZA, marginBottom: 8 },
  itemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "#eef1f5",
    paddingVertical: 3,
  },
  itemNome: { flex: 1 },
  itemQtd: { fontFamily: "Helvetica-Bold" },
  vazio: { fontSize: 10, color: CINZA, fontStyle: "italic" },
  evento: {
    borderWidth: 1,
    borderColor: BORDA,
    borderRadius: 4,
    padding: 8,
    marginBottom: 6,
  },
  eventoTopo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  eventoData: { fontFamily: "Helvetica-Bold" },
  eventoLoc: { color: CINZA, fontSize: 9 },
  eventoLinha: { fontSize: 9, marginTop: 1 },
  eventoAdic: { fontSize: 9, color: CINZA, marginTop: 2 },
  rodape: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: CINZA,
    borderTopWidth: 1,
    borderTopColor: "#eef1f5",
    paddingTop: 6,
  },
});

export interface GerarPdfOpcoes {
  /** Sobrescreve o subtítulo padrão (ex.: quando disparado pelo cron). */
  subtitulo?: string;
}

function loc(numero: number): string {
  return `LOC-${String(numero).padStart(6, "0")}`;
}

function EventoBloco({ p }: { p: PedidoCoffee }) {
  const servir = p.horarioServirUtc
    ? `servir ${horaSP(p.horarioServirUtc)}`
    : null;
  return (
    <View style={styles.evento} wrap={false}>
      <View style={styles.eventoTopo}>
        <Text style={styles.eventoData}>
          {dataSP(p.inicioUtc)}
          {servir ? ` · ${servir}` : ""}
        </Text>
        <Text style={styles.eventoLoc}>{loc(p.numero)}</Text>
      </View>
      <Text style={styles.eventoLinha}>{p.locatario}</Text>
      <Text style={styles.eventoLinha}>
        {p.salas.join(", ") || "—"} · {p.nivelNome || "—"} · {p.qtdPessoas}{" "}
        pessoas
      </Text>
      {p.nivelDescricao ? (
        <Text style={styles.eventoAdic}>{p.nivelDescricao}</Text>
      ) : null}
      {p.adicionais.length > 0 ? (
        <Text style={styles.eventoAdic}>
          Adicionais:{" "}
          {p.adicionais
            .map((a) => `${a.descricao} (${centavosParaBRL(a.valorCentavos)})`)
            .join(", ")}
        </Text>
      ) : null}
      {p.observacoes ? (
        <Text style={styles.eventoAdic}>Obs.: {p.observacoes}</Text>
      ) : null}
    </View>
  );
}

async function carregarLogo(): Promise<Buffer | null> {
  try {
    return await readFile(join(process.cwd(), "public", "logo-acimm.png"));
  } catch {
    return null;
  }
}

export async function gerarPdfCompras(
  intervalo: IntervaloCoffee,
  opcoes: GerarPdfOpcoes = {},
): Promise<Buffer> {
  const { pedidos, consolidado } = await carregarPedidosCoffee(intervalo, false);
  const logo = await carregarLogo();
  const geradoEm = new Date().toISOString();

  const doc = (
    <Document
      title={`Compras coffee break — ${intervalo.rotulo}`}
      author="ACIMM"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logo ? (
            <Image style={styles.logo} src={{ data: logo, format: "png" }} />
          ) : null}
          <View>
            <Text style={styles.titulo}>Lista de compras — Coffee break</Text>
            <Text style={styles.subtitulo}>
              {opcoes.subtitulo ?? `Período: ${intervalo.rotulo}`}
            </Text>
          </View>
        </View>

        <Text style={styles.secaoTitulo}>Consolidado de compras</Text>
        <Text style={styles.resumoLinha}>
          {consolidado.qtdPedidos} pedido(s) firme(s) ·{" "}
          {consolidado.totalPessoas} pessoas atendidas
        </Text>
        {consolidado.itens.length === 0 ? (
          <Text style={styles.vazio}>Nenhum item de compra no período.</Text>
        ) : (
          consolidado.itens.map((it) => (
            <View key={`${it.item}-${it.unidade}`} style={styles.itemRow}>
              <Text style={styles.itemNome}>{it.item}</Text>
              <Text style={styles.itemQtd}>
                {formatarQuantidade(it.quantidade)} {it.unidade}
              </Text>
            </View>
          ))
        )}

        <Text style={styles.secaoTitulo}>Detalhamento por evento</Text>
        {pedidos.length === 0 ? (
          <Text style={styles.vazio}>Nenhum pedido firme no período.</Text>
        ) : (
          pedidos.map((p) => <EventoBloco key={p.coffeeId} p={p} />)
        )}

        <View style={styles.rodape} fixed>
          <Text>ACIMM · Documento interno de compras</Text>
          <Text>
            Gerado em {dataSP(geradoEm)} {horaSP(geradoEm)}
          </Text>
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
