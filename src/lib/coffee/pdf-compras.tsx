import "server-only";
import { Document, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { dataSP, horaSP } from "@/lib/calendario/tempo";
import { rotuloLocacao } from "@/lib/locacoes/tipos";
import { centavosParaBRL } from "@/lib/utils/moeda";
import { carregarPedidosCoffee } from "./dados";
import type { IntervaloCoffee } from "./periodo";
import { formatarQuantidade, type PedidoCoffee } from "./tipos";
import {
  CabecalhoRelatorio,
  carregarLogoAcimm,
  estilosRelatorio,
  RodapeRelatorio,
} from "@/lib/relatorios/pdf-estilo";

/**
 * PDF consolidado de compras de coffee break (Spec 08 §5), no mesmo modelo de
 * tabela do relatório de locações (`relatorios/pdf-mes.tsx` — estilo
 * compartilhado em `pdf-estilo.tsx`). `gerarPdfCompras` é a função
 * reutilizável — a tela `/admin/coffee` chama para download manual e o cron
 * semanal (Spec 16) chama a mesma função. Inclui SEMPRE apenas pedidos firmes
 * (documento de compra não especula sobre pendentes).
 */

const styles = StyleSheet.create({
  cItem: { flex: 1 },
  cQtd: { width: "30%", textAlign: "right" },
  cData: { width: "9%" },
  cNum: { width: "10%" },
  cLoc: { width: "20%" },
  cSala: { width: "15%" },
  cNivel: { width: "15%" },
  cPessoas: { width: "9%", textAlign: "right" },
  cValor: { width: "12%", textAlign: "right" },
});

export interface GerarPdfOpcoes {
  /** Sobrescreve o subtítulo padrão (ex.: quando disparado pelo cron). */
  subtitulo?: string;
}

function valorPedidoCentavos(p: PedidoCoffee): number {
  return (
    p.valorCentavos +
    p.adicionais.reduce((s, a) => s + a.valorCentavos, 0)
  );
}

function PedidoLinha({ p }: { p: PedidoCoffee }) {
  const servir = p.horarioServirUtc ? `servir ${horaSP(p.horarioServirUtc)}` : null;
  const secundaria = [
    p.adicionais.length > 0
      ? `Adicionais: ${p.adicionais
          .map((a) => `${a.descricao} (${centavosParaBRL(a.valorCentavos)})`)
          .join(", ")}`
      : null,
    p.observacoes ? `Obs.: ${p.observacoes}` : null,
    servir,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View style={estilosRelatorio.row} wrap={false}>
      <View style={{ flexDirection: "column", width: "100%" }}>
        <View style={{ flexDirection: "row" }}>
          <Text style={styles.cData}>{dataSP(p.inicioUtc)}</Text>
          <Text style={styles.cNum}>{rotuloLocacao(p.numero)}</Text>
          <Text style={styles.cLoc}>{p.locatario}</Text>
          <Text style={styles.cSala}>{p.salas.join(", ") || "—"}</Text>
          <Text style={styles.cNivel}>{p.nivelNome || "—"}</Text>
          <Text style={styles.cPessoas}>{p.qtdPessoas}</Text>
          <Text style={styles.cValor}>{centavosParaBRL(valorPedidoCentavos(p))}</Text>
        </View>
        {secundaria ? (
          <Text style={estilosRelatorio.linhaSecundaria}>{secundaria}</Text>
        ) : null}
      </View>
    </View>
  );
}

export async function gerarPdfCompras(
  intervalo: IntervaloCoffee,
  opcoes: GerarPdfOpcoes = {},
): Promise<Buffer> {
  const { pedidos, consolidado } = await carregarPedidosCoffee(intervalo, false);
  const logo = await carregarLogoAcimm();
  const geradoEm = new Date().toISOString();
  const valorTotalCentavos = pedidos.reduce((s, p) => s + valorPedidoCentavos(p), 0);

  const doc = (
    <Document
      title={`Compras coffee break — ${intervalo.rotulo}`}
      author="ACIMM"
    >
      <Page size="A4" style={estilosRelatorio.page}>
        <CabecalhoRelatorio
          logo={logo}
          titulo="Lista de compras — Coffee break"
          subtitulo={opcoes.subtitulo ?? `Período: ${intervalo.rotulo}`}
        />

        <Text style={estilosRelatorio.secaoTitulo}>Consolidado de compras</Text>
        {consolidado.itens.length === 0 ? (
          <Text style={estilosRelatorio.vazio}>
            Nenhum item de compra no período.
          </Text>
        ) : (
          <>
            <View style={estilosRelatorio.thead}>
              <Text style={styles.cItem}>Item</Text>
              <Text style={styles.cQtd}>Quantidade</Text>
            </View>
            {consolidado.itens.map((it) => (
              <View key={`${it.item}-${it.unidade}`} style={estilosRelatorio.row}>
                <Text style={styles.cItem}>{it.item}</Text>
                <Text style={styles.cQtd}>
                  {formatarQuantidade(it.quantidade)} {it.unidade}
                </Text>
              </View>
            ))}
          </>
        )}

        <Text style={estilosRelatorio.secaoTitulo}>Detalhamento por evento</Text>
        {pedidos.length === 0 ? (
          <Text style={estilosRelatorio.vazio}>Nenhum pedido firme no período.</Text>
        ) : (
          <>
            <View style={estilosRelatorio.thead}>
              <Text style={styles.cData}>Data</Text>
              <Text style={styles.cNum}>LOC-nº</Text>
              <Text style={styles.cLoc}>Locatário</Text>
              <Text style={styles.cSala}>Sala(s)</Text>
              <Text style={styles.cNivel}>Nível</Text>
              <Text style={styles.cPessoas}>Pessoas</Text>
              <Text style={styles.cValor}>Valor</Text>
            </View>
            {pedidos.map((p) => (
              <PedidoLinha key={p.coffeeId} p={p} />
            ))}
          </>
        )}

        <View style={estilosRelatorio.totais}>
          <View style={estilosRelatorio.totalLinha}>
            <Text style={estilosRelatorio.totalRotulo}>
              Pedidos firmes: {consolidado.qtdPedidos}
            </Text>
          </View>
          <View style={estilosRelatorio.totalLinha}>
            <Text style={estilosRelatorio.totalRotulo}>Pessoas atendidas</Text>
            <Text>{consolidado.totalPessoas}</Text>
          </View>
          <View style={estilosRelatorio.totalLinha}>
            <Text style={estilosRelatorio.totalGeral}>Total geral</Text>
            <Text style={estilosRelatorio.totalGeral}>
              {centavosParaBRL(valorTotalCentavos)}
            </Text>
          </View>
        </View>

        <RodapeRelatorio
          texto="ACIMM · Lista de compras — Coffee break"
          geradoEmUtc={geradoEm}
        />
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
