import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { dataSP } from "@/lib/calendario/tempo";
import { PERIODOS } from "@/lib/dominio";
import type { ResultadoCalculo } from "@/lib/locacoes/calcular";
import { centavosParaBRL } from "@/lib/utils/moeda";
import {
  CabecalhoRelatorio,
  carregarLogoAcimm,
  diaBR,
  estilosRelatorio,
  RodapeRelatorio,
} from "@/lib/relatorios/pdf-estilo";
import { rotuloCotacao } from "./tipos";

/**
 * PDF da cotação — mesmo modelo do relatório de locações (`pdf-estilo.tsx`):
 * cabeçalho com logo, linhas rotulo/valor e bloco de totais.
 */

const styles = StyleSheet.create({
  linha: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  rotulo: { color: "#6b7280" },
});

export interface DadosPdfCotacao {
  numero: number;
  locatarioNome: string;
  salas: string[];
  data: string | null;
  periodo: string | null;
  qtdPessoas: number | null;
  resultado: ResultadoCalculo;
  criadoEmUtc: string;
}

export async function gerarPdfCotacao(d: DadosPdfCotacao): Promise<Buffer> {
  const logo = await carregarLogoAcimm();
  const geradoEm = new Date().toISOString();
  const periodoRotulo = d.periodo
    ? (PERIODOS.find((p) => p.valor === d.periodo)?.rotulo ?? d.periodo)
    : "—";

  const doc = (
    <Document title={`Cotação ${rotuloCotacao(d.numero)}`} author="ACIMM">
      <Page size="A4" style={estilosRelatorio.page}>
        <CabecalhoRelatorio
          logo={logo}
          titulo="Cotação de aluguel"
          subtitulo={`${rotuloCotacao(d.numero)} · emitida em ${dataSP(d.criadoEmUtc)}`}
        />

        <View style={styles.linha}>
          <Text style={styles.rotulo}>Locatário</Text>
          <Text>{d.locatarioNome}</Text>
        </View>
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Sala(s)</Text>
          <Text>{d.salas.join(", ") || "—"}</Text>
        </View>
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Data de referência</Text>
          <Text>{d.data ? diaBR(d.data) : "A definir"}</Text>
        </View>
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Período</Text>
          <Text>{periodoRotulo}</Text>
        </View>
        <View style={styles.linha}>
          <Text style={styles.rotulo}>Pessoas</Text>
          <Text>{d.qtdPessoas ?? "—"}</Text>
        </View>

        <View style={estilosRelatorio.totais}>
          <View style={estilosRelatorio.totalLinha}>
            <Text style={estilosRelatorio.totalRotulo}>Salas</Text>
            <Text>{centavosParaBRL(d.resultado.salasCentavos)}</Text>
          </View>
          <View style={estilosRelatorio.totalLinha}>
            <Text style={estilosRelatorio.totalRotulo}>Coffee break</Text>
            <Text>{centavosParaBRL(d.resultado.coffeeCentavos)}</Text>
          </View>
          <View style={estilosRelatorio.totalLinha}>
            <Text style={estilosRelatorio.totalRotulo}>Adicionais</Text>
            <Text>{centavosParaBRL(d.resultado.adicionaisCentavos)}</Text>
          </View>
          {d.resultado.descontosCentavos > 0 ? (
            <View style={estilosRelatorio.totalLinha}>
              <Text style={estilosRelatorio.totalRotulo}>Descontos</Text>
              <Text>- {centavosParaBRL(d.resultado.descontosCentavos)}</Text>
            </View>
          ) : null}
          <View style={estilosRelatorio.totalLinha}>
            <Text style={estilosRelatorio.totalGeral}>Total estimado</Text>
            <Text style={estilosRelatorio.totalGeral}>
              {centavosParaBRL(d.resultado.totalCentavos)}
            </Text>
          </View>
        </View>

        <Text style={estilosRelatorio.vazio}>
          Cotação sem compromisso de agenda — valores sujeitos a confirmação
          de disponibilidade no momento da reserva.
        </Text>

        <RodapeRelatorio texto="ACIMM · Cotação de aluguel" geradoEmUtc={geradoEm} />
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
