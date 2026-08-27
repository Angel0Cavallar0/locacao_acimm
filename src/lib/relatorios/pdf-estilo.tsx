import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Image, StyleSheet, Text, View } from "@react-pdf/renderer";
import { dataSP, horaSP } from "@/lib/calendario/tempo";

/**
 * Peças visuais compartilhadas entre os relatórios em PDF (identidade ACIMM):
 * cabeçalho com logo, tabela clássica (thead/linha), bloco de totais e
 * rodapé. Usado por `relatorios/pdf-mes.tsx` e `coffee/pdf-compras.tsx` —
 * são o mesmo "modelo de relatório", só com colunas diferentes.
 */

export const CORES = {
  azul: "#123B6D",
  cinza: "#6b7280",
} as const;

export const estilosRelatorio = StyleSheet.create({
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
    borderBottomColor: CORES.azul,
    paddingBottom: 12,
    marginBottom: 16,
  },
  logo: { width: 52, height: 52, objectFit: "contain" },
  titulo: { fontSize: 15, fontFamily: "Helvetica-Bold", color: CORES.azul },
  subtitulo: { fontSize: 10, color: CORES.cinza, marginTop: 2 },
  secaoTitulo: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: CORES.azul,
    marginTop: 8,
    marginBottom: 6,
  },
  thead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: CORES.azul,
    paddingBottom: 4,
    marginBottom: 2,
    fontFamily: "Helvetica-Bold",
    color: CORES.azul,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#eef1f5",
    paddingVertical: 3,
  },
  linhaSecundaria: {
    fontSize: 8,
    color: CORES.cinza,
    marginTop: 1,
    paddingLeft: 2,
  },
  vazio: { fontSize: 10, color: CORES.cinza, fontStyle: "italic", marginTop: 8 },
  totais: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: CORES.azul,
    paddingTop: 8,
    gap: 2,
  },
  totalLinha: { flexDirection: "row", justifyContent: "space-between" },
  totalRotulo: { color: CORES.cinza },
  totalGeral: { fontFamily: "Helvetica-Bold", fontSize: 11, color: CORES.azul },
  rodape: {
    position: "absolute",
    bottom: 20,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: CORES.cinza,
    borderTopWidth: 1,
    borderTopColor: "#eef1f5",
    paddingTop: 6,
  },
});

export async function carregarLogoAcimm(): Promise<Buffer | null> {
  try {
    return await readFile(join(process.cwd(), "public", "logo-acimm.png"));
  } catch {
    return null;
  }
}

export function CabecalhoRelatorio({
  logo,
  titulo,
  subtitulo,
}: {
  logo: Buffer | null;
  titulo: string;
  subtitulo: string;
}) {
  return (
    <View style={estilosRelatorio.header}>
      {logo ? (
        <Image style={estilosRelatorio.logo} src={{ data: logo, format: "png" }} />
      ) : null}
      <View>
        <Text style={estilosRelatorio.titulo}>{titulo}</Text>
        <Text style={estilosRelatorio.subtitulo}>{subtitulo}</Text>
      </View>
    </View>
  );
}

export function RodapeRelatorio({
  texto,
  geradoEmUtc,
}: {
  texto: string;
  geradoEmUtc: string;
}) {
  return (
    <View style={estilosRelatorio.rodape} fixed>
      <Text>{texto}</Text>
      <Text>
        Gerado em {dataSP(geradoEmUtc)} {horaSP(geradoEmUtc)}
      </Text>
    </View>
  );
}

/** 'YYYY-MM-DD' → 'DD/MM/YYYY'. */
export function diaBR(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}
