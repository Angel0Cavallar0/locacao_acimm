import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { centavosParaBRL } from "@/lib/utils/moeda";
import type { RelatorioMes } from "./dados";
import {
  CabecalhoRelatorio,
  carregarLogoAcimm,
  diaBR,
  estilosRelatorio,
  RodapeRelatorio,
} from "./pdf-estilo";

/**
 * Relatório mensal de locações em PDF (Spec 32 §1.4). Mesmo padrão de
 * `coffee/pdf-compras.tsx` (estilo compartilhado em `pdf-estilo.tsx`):
 * `renderToBuffer`, logo do disco, identidade ACIMM. É o documento que a
 * equipe leva à diretoria.
 */

const styles = StyleSheet.create({
  cData: { width: "10%" },
  cLoc: { width: "24%" },
  cSala: { width: "20%" },
  cEvento: { width: "16%" },
  cForma: { width: "12%" },
  cNum: { width: "9%", textAlign: "right" },
});

export async function gerarPdfMes(rel: RelatorioMes): Promise<Buffer> {
  const logo = await carregarLogoAcimm();
  const geradoEm = new Date().toISOString();
  const periodo = `${diaBR(rel.deISO)} a ${diaBR(rel.ateISO)}`;

  const doc = (
    <Document title={`Locações — ${periodo}`} author="ACIMM">
      <Page size="A4" style={estilosRelatorio.page}>
        <CabecalhoRelatorio
          logo={logo}
          titulo="Relatório de locações"
          subtitulo={`Período: ${periodo}`}
        />

        <View style={estilosRelatorio.thead}>
          <Text style={styles.cData}>Data</Text>
          <Text style={styles.cLoc}>Locatário</Text>
          <Text style={styles.cSala}>Sala(s)</Text>
          <Text style={styles.cEvento}>Evento</Text>
          <Text style={styles.cForma}>Forma</Text>
          <Text style={styles.cNum}>Valor</Text>
        </View>

        {rel.linhas.length === 0 ? (
          <Text style={estilosRelatorio.vazio}>
            Nenhuma locação arrecadada no período.
          </Text>
        ) : (
          rel.linhas.map((l) => (
            <View key={l.numero} style={estilosRelatorio.row} wrap={false}>
              <Text style={styles.cData}>{diaBR(l.dataISO)}</Text>
              <Text style={styles.cLoc}>{l.locatario}</Text>
              <Text style={styles.cSala}>{l.salas}</Text>
              <Text style={styles.cEvento}>{l.evento}</Text>
              <Text style={styles.cForma}>{l.forma}</Text>
              <Text style={styles.cNum}>{centavosParaBRL(l.totalCentavos)}</Text>
            </View>
          ))
        )}

        <View style={estilosRelatorio.totais}>
          <View style={estilosRelatorio.totalLinha}>
            <Text style={estilosRelatorio.totalRotulo}>
              Locações no período: {rel.quantidade}
            </Text>
          </View>
          <View style={estilosRelatorio.totalLinha}>
            <Text style={estilosRelatorio.totalRotulo}>Subtotal salas</Text>
            <Text>{centavosParaBRL(rel.subtotalSalasCentavos)}</Text>
          </View>
          <View style={estilosRelatorio.totalLinha}>
            <Text style={estilosRelatorio.totalRotulo}>Subtotal coffee break</Text>
            <Text>{centavosParaBRL(rel.subtotalCoffeeCentavos)}</Text>
          </View>
          <View style={estilosRelatorio.totalLinha}>
            <Text style={estilosRelatorio.totalGeral}>Total geral</Text>
            <Text style={estilosRelatorio.totalGeral}>
              {centavosParaBRL(rel.totalCentavos)}
            </Text>
          </View>
        </View>

        <RodapeRelatorio texto="ACIMM · Relatório de locações" geradoEmUtc={geradoEm} />
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
