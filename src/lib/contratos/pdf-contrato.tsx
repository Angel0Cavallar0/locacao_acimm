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
import { FORMA_PAGAMENTO_ROTULO } from "@/lib/locacoes/tipos";
import { formatarDocumento } from "@/lib/locacoes/tipos";
import { centavosParaBRL } from "@/lib/utils/moeda";
import type { DadosContrato } from "./tipos";

/**
 * PDF do contrato de locação (Spec 13 §2), fiel ao modelo real da ACIMM
 * (docs/referencias/Contrato_de_Locacao_modelo.pdf). Sem horários hardcoded
 * (imprime os reais), sem checkboxes, sem cartão; coffee com faixa aplicada +
 * adicionais valorados; equipamentos por sala; textos jurídicos vindos de
 * `configuracoes.contrato_textos`.
 */

const AZUL = "#123B6D";
const CINZA = "#6b7280";
const BORDA = "#d1d5db";

const styles = StyleSheet.create({
  page: {
    paddingTop: 30,
    paddingBottom: 44,
    paddingHorizontal: 40,
    fontSize: 9.5,
    lineHeight: 1.4,
    color: "#111827",
    fontFamily: "Helvetica",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 2,
    borderBottomColor: AZUL,
    paddingBottom: 10,
    marginBottom: 12,
  },
  logo: { width: 46, height: 46, objectFit: "contain" },
  titulo: { fontSize: 13, fontFamily: "Helvetica-Bold", color: AZUL },
  secaoTitulo: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    color: AZUL,
    marginTop: 10,
    marginBottom: 4,
  },
  linha: { marginBottom: 1.5 },
  rotulo: { fontFamily: "Helvetica-Bold" },
  bloco: {
    borderWidth: 1,
    borderColor: BORDA,
    borderRadius: 4,
    padding: 7,
    marginTop: 3,
  },
  valorRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 1.5,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: BORDA,
    marginTop: 3,
    paddingTop: 3,
  },
  totalTexto: { fontFamily: "Helvetica-Bold", color: AZUL },
  clausula: { marginBottom: 4 },
  bullet: { flexDirection: "row", gap: 4, marginBottom: 2 },
  equipItem: { marginBottom: 1 },
  salaEquipTitulo: {
    fontFamily: "Helvetica-Bold",
    marginTop: 4,
    marginBottom: 1,
  },
  termo: {
    borderWidth: 1,
    borderColor: AZUL,
    borderRadius: 4,
    padding: 8,
    marginTop: 8,
    fontStyle: "italic",
  },
  assinaturas: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 34,
  },
  assinaturaBox: { width: "45%", alignItems: "center" },
  assinaturaLinha: {
    borderTopWidth: 1,
    borderTopColor: "#111827",
    width: "100%",
    marginBottom: 3,
  },
  assinaturaLabel: { fontSize: 8, color: CINZA, textAlign: "center" },
  rodape: {
    position: "absolute",
    bottom: 18,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: CINZA,
    borderTopWidth: 1,
    borderTopColor: "#eef1f5",
    paddingTop: 5,
  },
});

function rotuloDocumento(doc: string): string {
  return doc.replace(/\D/g, "").length === 11 ? "CPF" : "CNPJ";
}

async function carregarLogo(): Promise<Buffer | null> {
  try {
    return await readFile(join(process.cwd(), "public", "logo-acimm.png"));
  } catch {
    return null;
  }
}

function Valor({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <View style={styles.valorRow}>
      <Text>{rotulo}</Text>
      <Text>{centavosParaBRL(valor)}</Text>
    </View>
  );
}

export async function gerarPdfContrato(dados: DadosContrato): Promise<Buffer> {
  const logo = await carregarLogo();
  const rot = `LOC-${String(dados.numero).padStart(6, "0")}`;
  const forma = dados.formaPagamento
    ? FORMA_PAGAMENTO_ROTULO[dados.formaPagamento]
    : "A combinar";
  const dp = dados.dadosPagamento;

  const doc = (
    <Document title={`Contrato ${rot}`} author="ACIMM">
      <Page size="A4" style={styles.page} wrap>
        {/* Cabeçalho */}
        <View style={styles.header}>
          {logo ? (
            <Image style={styles.logo} src={{ data: logo, format: "png" }} />
          ) : null}
          <View>
            <Text style={styles.titulo}>
              CONTRATO DE LOCAÇÃO E USO DE AMBIENTES – ACIMM
            </Text>
            <Text style={{ fontSize: 8.5, color: CINZA }}>{rot}</Text>
          </View>
        </View>

        {/* 1. Das partes */}
        <Text style={styles.secaoTitulo}>1. DAS PARTES</Text>
        <Text style={styles.linha}>
          <Text style={styles.rotulo}>LOCADORA: </Text>
          {dados.textos.locadora}
        </Text>
        <Text style={styles.linha}>
          <Text style={styles.rotulo}>LOCATÁRIA: </Text>
          {dados.locatarioNome}
        </Text>
        <Text style={styles.linha}>
          <Text style={styles.rotulo}>
            {rotuloDocumento(dados.locatarioDocumento)}:{" "}
          </Text>
          {formatarDocumento(dados.locatarioDocumento)}
        </Text>
        <Text style={styles.linha}>
          <Text style={styles.rotulo}>Responsável: </Text>
          {dados.responsavelNome}
        </Text>
        <Text style={styles.linha}>
          <Text style={styles.rotulo}>Telefone: </Text>
          {dados.locatarioTelefone || "—"}
        </Text>

        {/* 2. Dados do evento e ambiente */}
        <Text style={styles.secaoTitulo}>2. DADOS DO EVENTO E AMBIENTE</Text>
        <Text style={styles.linha}>
          <Text style={styles.rotulo}>Data: </Text>
          {dados.dataEventoCurta}
        </Text>
        <Text style={styles.linha}>
          <Text style={styles.rotulo}>Participantes: </Text>
          {dados.qtdPessoas}
        </Text>
        <Text style={styles.linha}>
          <Text style={styles.rotulo}>Período: </Text>
          {dados.periodoRotulo} ({dados.horaInicio} às {dados.horaFim})
        </Text>
        {dados.tipoEvento ? (
          <Text style={styles.linha}>
            <Text style={styles.rotulo}>Tipo de evento: </Text>
            {dados.tipoEvento}
          </Text>
        ) : null}
        <Text style={styles.linha}>
          <Text style={styles.rotulo}>Ambiente(s): </Text>
          {dados.salas.map((s) => s.nome).join(", ") || "—"}
        </Text>

        {/* 3. Coffee break */}
        <Text style={styles.secaoTitulo}>3. COFFEE BREAK</Text>
        {dados.coffee ? (
          <View style={styles.bloco}>
            <Text style={styles.linha}>
              <Text style={styles.rotulo}>Nível: </Text>
              {dados.coffee.nivelNome}
              {dados.coffee.faixaRotulo
                ? ` — ${dados.coffee.faixaRotulo} pessoas · ${centavosParaBRL(dados.coffee.valorPessoaCentavos)}/pessoa`
                : ""}
            </Text>
            <Text style={styles.linha}>
              <Text style={styles.rotulo}>Qtd. pessoas: </Text>
              {dados.coffee.qtdPessoas}
            </Text>
            {dados.coffee.adicionais.length > 0 ? (
              <Text style={styles.linha}>
                <Text style={styles.rotulo}>Adicionais: </Text>
                {dados.coffee.adicionais
                  .map(
                    (a) =>
                      `${a.descricao} (${centavosParaBRL(a.valorCentavos)})`,
                  )
                  .join(", ")}
              </Text>
            ) : null}
            <View style={styles.valorRow}>
              <Text style={styles.rotulo}>Subtotal coffee</Text>
              <Text style={styles.rotulo}>
                {centavosParaBRL(dados.coffee.valorCentavos)}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={{ color: CINZA, fontStyle: "italic" }}>
            Não contratado.
          </Text>
        )}

        {/* Adicionais da locação */}
        {dados.adicionais.length > 0 ? (
          <>
            <Text style={styles.secaoTitulo}>ADICIONAIS DA LOCAÇÃO</Text>
            <View style={styles.bloco}>
              {dados.adicionais.map((a) => (
                <View
                  key={`${a.descricao}-${a.valorUnitarioCentavos}`}
                  style={styles.valorRow}
                >
                  <Text>
                    {a.descricao} × {a.quantidade}
                  </Text>
                  <Text>
                    {centavosParaBRL(a.quantidade * a.valorUnitarioCentavos)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* 4. Pagamento */}
        <Text style={styles.secaoTitulo}>4. PAGAMENTO</Text>
        <View style={styles.bloco}>
          <Valor rotulo="Valor Locação" valor={dados.valorSalasCentavos} />
          <Valor rotulo="Valor Coffee" valor={dados.valorCoffeeCentavos} />
          {dados.valorAdicionaisCentavos > 0 ? (
            <Valor rotulo="Adicionais" valor={dados.valorAdicionaisCentavos} />
          ) : null}
          {dados.valorDescontosCentavos > 0 ? (
            <View style={styles.valorRow}>
              <Text>Descontos</Text>
              <Text>− {centavosParaBRL(dados.valorDescontosCentavos)}</Text>
            </View>
          ) : null}
          <View style={styles.totalRow}>
            <Text style={styles.totalTexto}>Valor total</Text>
            <Text style={styles.totalTexto}>
              {centavosParaBRL(dados.valorTotalCentavos)}
            </Text>
          </View>
        </View>
        <Text style={[styles.linha, { marginTop: 4 }]}>
          <Text style={styles.rotulo}>Forma de pagamento: </Text>
          {forma}
        </Text>
        {dados.formaPagamento === "transferencia" ? (
          <Text style={styles.linha}>
            {dp.banco} — Banco {dp.codigoBanco} | Agência {dp.agencia} | Conta{" "}
            {dp.conta}
          </Text>
        ) : null}
        {dados.formaPagamento === "pix" && dp.pix ? (
          <Text style={styles.linha}>PIX: {dp.pix}</Text>
        ) : null}

        {/* 5. Especificações da sala */}
        <Text style={styles.secaoTitulo}>5. ESPECIFICAÇÕES DA SALA</Text>
        {dados.salas.map((s) => (
          <View key={s.nome} wrap={false}>
            {dados.salas.length > 1 ? (
              <Text style={styles.salaEquipTitulo}>{s.nome}</Text>
            ) : null}
            {s.equipamentos.length > 0 ? (
              s.equipamentos.map((e) => (
                <Text key={e} style={styles.equipItem}>
                  • {e}
                </Text>
              ))
            ) : (
              <Text style={{ color: CINZA }}>
                Sem equipamentos cadastrados.
              </Text>
            )}
          </View>
        ))}

        {/* 6. Cláusulas */}
        <Text style={styles.secaoTitulo}>6. CLÁUSULAS E RESPONSABILIDADES</Text>
        {dados.textos.clausulas.map((c, i) => (
          <View key={c.titulo || String(i)} style={styles.clausula} wrap={false}>
            <Text>
              <Text style={styles.rotulo}>
                {i + 1}. {c.titulo}
                {c.titulo ? ": " : ""}
              </Text>
              {c.texto}
            </Text>
          </View>
        ))}

        {/* 7. Considerações finais */}
        {dados.textos.consideracoesFinais.length > 0 ? (
          <>
            <Text style={styles.secaoTitulo}>7. CONSIDERAÇÕES FINAIS</Text>
            {dados.textos.consideracoesFinais.map((c) => (
              <View key={c} style={styles.bullet}>
                <Text>–</Text>
                <Text style={{ flex: 1 }}>{c}</Text>
              </View>
            ))}
          </>
        ) : null}

        {/* Termo */}
        {dados.textos.termoResponsabilidade ? (
          <>
            <Text style={styles.secaoTitulo}>TERMO DE RESPONSABILIDADE</Text>
            <Text style={styles.termo}>
              {dados.textos.termoResponsabilidade}
            </Text>
          </>
        ) : null}

        {/* Data + assinaturas */}
        <Text style={{ marginTop: 14 }} wrap={false}>
          Mogi Mirim, {dados.dataGeracaoExtenso}.
        </Text>
        <View style={styles.assinaturas} wrap={false}>
          <View style={styles.assinaturaBox}>
            <View style={styles.assinaturaLinha} />
            <Text style={styles.assinaturaLabel}>
              Assinatura do Representante da Locatária
            </Text>
          </View>
          <View style={styles.assinaturaBox}>
            <View style={styles.assinaturaLinha} />
            <Text style={styles.assinaturaLabel}>
              Associação Comercial e Industrial de Mogi Mirim
            </Text>
          </View>
        </View>

        <Text style={styles.rodape} fixed>
          @acimmmogimirim · 19 3814-5760 · www.acimm.com.br
        </Text>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
