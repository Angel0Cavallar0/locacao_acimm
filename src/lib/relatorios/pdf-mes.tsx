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
import type { RelatorioMes } from "./dados";

/**
 * Relatório mensal de locações em PDF (Spec 32 §1.4). Mesmo padrão de
 * `coffee/pdf-compras.tsx`: `renderToBuffer`, logo do disco, identidade ACIMM.
 * É o documento que a equipe leva à diretoria.
 */

const AZUL = "#123B6D";
const CINZA = "#6b7280";

const styles = StyleSheet.create({
  page: {
    paddingTop: 32,
    paddingBottom: 44,
    paddingHorizontal: 36,
    fontSize: 9,
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
  thead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: AZUL,
    paddingBottom: 4,
    marginBottom: 2,
    fontFamily: "Helvetica-Bold",
    color: AZUL,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eef1f5",
    paddingVertical: 3,
  },
  cData: { width: "10%" },
  cLoc: { width: "24%" },
  cSala: { width: "20%" },
  cEvento: { width: "16%" },
  cForma: { width: "12%" },
  cNum: { width: "9%", textAlign: "right" },
  vazio: { fontSize: 10, color: CINZA, fontStyle: "italic", marginTop: 8 },
  totais: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: AZUL,
    paddingTop: 8,
    gap: 2,
  },
  totalLinha: { flexDirection: "row", justifyContent: "space-between" },
  totalRotulo: { color: CINZA },
  totalGeral: { fontFamily: "Helvetica-Bold", fontSize: 11, color: AZUL },
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

async function carregarLogo(): Promise<Buffer | null> {
  try {
    return await readFile(join(process.cwd(), "public", "logo-acimm.png"));
  } catch {
    return null;
  }
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
function diaBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

export async function gerarPdfMes(rel: RelatorioMes): Promise<Buffer> {
  const logo = await carregarLogo();
  const geradoEm = new Date().toISOString();
  const periodo = `${diaBR(rel.deISO)} a ${diaBR(rel.ateISO)}`;

  const doc = (
    <Document title={`Locações — ${periodo}`} author="ACIMM">
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {logo ? (
            <Image style={styles.logo} src={{ data: logo, format: "png" }} />
          ) : null}
          <View>
            <Text style={styles.titulo}>Relatório de locações</Text>
            <Text style={styles.subtitulo}>Período: {periodo}</Text>
          </View>
        </View>

        <View style={styles.thead}>
          <Text style={styles.cData}>Data</Text>
          <Text style={styles.cLoc}>Locatário</Text>
          <Text style={styles.cSala}>Sala(s)</Text>
          <Text style={styles.cEvento}>Evento</Text>
          <Text style={styles.cForma}>Forma</Text>
          <Text style={styles.cNum}>Valor</Text>
        </View>

        {rel.linhas.length === 0 ? (
          <Text style={styles.vazio}>Nenhuma locação arrecadada no período.</Text>
        ) : (
          rel.linhas.map((l) => (
            <View key={l.numero} style={styles.row} wrap={false}>
              <Text style={styles.cData}>{diaBR(l.dataISO)}</Text>
              <Text style={styles.cLoc}>{l.locatario}</Text>
              <Text style={styles.cSala}>{l.salas}</Text>
              <Text style={styles.cEvento}>{l.evento}</Text>
              <Text style={styles.cForma}>{l.forma}</Text>
              <Text style={styles.cNum}>{centavosParaBRL(l.totalCentavos)}</Text>
            </View>
          ))
        )}

        <View style={styles.totais}>
          <View style={styles.totalLinha}>
            <Text style={styles.totalRotulo}>
              Locações no período: {rel.quantidade}
            </Text>
          </View>
          <View style={styles.totalLinha}>
            <Text style={styles.totalRotulo}>Subtotal salas</Text>
            <Text>{centavosParaBRL(rel.subtotalSalasCentavos)}</Text>
          </View>
          <View style={styles.totalLinha}>
            <Text style={styles.totalRotulo}>Subtotal coffee break</Text>
            <Text>{centavosParaBRL(rel.subtotalCoffeeCentavos)}</Text>
          </View>
          <View style={styles.totalLinha}>
            <Text style={styles.totalGeral}>Total geral</Text>
            <Text style={styles.totalGeral}>
              {centavosParaBRL(rel.totalCentavos)}
            </Text>
          </View>
        </View>

        <View style={styles.rodape} fixed>
          <Text>ACIMM · Relatório de locações</Text>
          <Text>
            Gerado em {dataSP(geradoEm)} {horaSP(geradoEm)}
          </Text>
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
