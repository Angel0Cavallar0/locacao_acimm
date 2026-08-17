# Spec 34 — Valor manual por sala + desconto manual na locação assistida

> Revisa o Spec 07 (locação assistida) e o Spec 31 (sobreposição/retroativas).
> Pedido do Angelo, sem migration (reaproveita colunas/estruturas já existentes).

---

## 1. Objetivo

As **locações retroativas** (Spec 31 §6) permitem ao colaborador registrar no sistema eventos que já
aconteceram — inclusive datas anteriores à existência de qualquer `precos_sala` para aquela
sala/período/condição. Isso quebrava o fluxo: `calcularValores()` marcava a sala como `semPreco: true`
e `criarLocacaoAssistida` rejeitava a criação ("Sem preço cadastrado... Cadastre em Salas › Preços").
Cadastrar hoje um preço com vigência retroativa não resolve bem — o histórico de preços da ACIMM não é
uma tabela de vigências limpa; cada locação antiga pode ter tido um valor negociado à parte.

Duas mudanças na etapa **"Pagamento e resumo"** da locação assistida (`/admin/locacoes/nova`):

1. Cada sala selecionada ganha um **valor editável**, pré-preenchido com o valor de referência
   calculado pelo servidor (`resolverPreco`). O colaborador pode sobrescrever esse valor **sempre**
   (não só em retroativas, não só quando falta preço).
2. Um **desconto manual** (percentual ou valor fixo em R$, motivo opcional) fica disponível em
   **qualquer** locação assistida — ferramenta comercial independente do bug de preço histórico.

---

## 2. Decisões travadas (Angelo)

- O valor editado por sala **nunca** altera `precos_sala` (a configuração de preços da sala é
  intocada) — é um valor específico só desta locação.
- O valor editado **vale para tudo**: grava em `valor_salas_centavos`/`locacao_salas.valor`, aparece no
  contrato, é o que se registra no pagamento e entra na base de cálculo da comissão. Não é um campo
  "só de exibição no contrato".
- O desconto manual **não exige motivo** (campo opcional) — mas quando informado, fica registrado na
  auditoria da locação.
- O desconto manual está disponível em **qualquer** locação assistida, não só nas retroativas — é
  ortogonal ao checkbox "Lançamento retroativo" (Spec 31 §6), que mantém seu comportamento de sempre.

Isso é uma extensão deliberada da regra "preço nunca vem do client" (CLAUDE.md §4.2) — **só para o
atendimento assistido** (sempre atrás de `requireColaborador()`), nunca para o portal do associado
(`/locacoes/nova`, `validacoes/solicitacao.ts`), que continua sem esse poder. É consistente com o
padrão já existente para "adicionais": o colaborador já digita valores livres para hora extra,
mobiliário etc. (`calcular.ts`: *"Os adicionais... são valores manuais digitados pelo colaborador...
a aritmética é sempre refeita aqui"*) — o valor da sala em si entra na mesma categoria, só no fluxo
assistido.

---

## 3. Modelo de cálculo (`lib/locacoes/calcular.ts`)

Sem migration: tudo reaproveita `locacao_salas.valor`, `locacoes.valor_descontos_centavos` e
`locacao_eventos` (auditoria). `criar_locacao_assistida` já aceita valor por sala pré-calculado
(`p_salas jsonb` com `{sala_id, valor}`) e o agregado de descontos (`p_valor_descontos`) — nunca chamou
`calcularValores`/`resolverPreco` internamente, então a assinatura da RPC não muda.

`EntradaCalculo` ganha dois campos opcionais, só usados pelo fluxo assistido:

- `valoresManuaisPorSala?: Record<string, number>` — salaId → centavos. Quando presente para uma sala,
  **sempre** vence sobre a referência de `resolverPreco()`.
- `descontoManual?: { tipo: "percentual" | "valor"; valor: number } | null`.

`SalaCalc`/`ResultadoCalculo.salas[]` ganham `referenciaCentavos: number | null` — o que
`resolverPreco()` teria calculado, só para exibição/comparação na UI; deixou de ser a autoridade final
do valor da sala no fluxo assistido (continua sendo a única fonte no portal, que nunca envia
`valoresManuaisPorSala`).

O desconto manual é calculado **sobre o valor de sala já líquido dos outros descontos** (combo
multi-sala, período gratuito) — mantém o invariante documentado em `comissoes-core.ts`
(*"todos os descontos do sistema são de sala"*), usado para `baseLocacao = salas+adicionais−descontos`
sem precisar mexer no motor de comissões (Spec 33). `calcularDescontoManual()`
(`calcular-core.ts`, pura/testada) trava percentual em 0–100 e valor fixo nunca passa da base restante.

---

## 4. Auditoria

Sem coluna nova. Depois de criar a locação, se algum `valorCentavos` final divergir do
`referenciaCentavos` e/ou houver desconto manual, grava **uma linha extra** em `locacao_eventos`
(mesmo padrão de `lib/locacoes/adicionais.ts`: `de`/`para` = status atual, sem mudar status) resumindo
o que foi feito — ex.: `"Valor manual — Sala A: R$ 150,00 (ref. sem preço de referência) · Desconto
manual — 10% (cliente fidelizado)"`. Só grava quando há algo fora do calculado, sem ruído no caso comum.

---

## 5. Fronteira de segurança

Só `src/app/admin/(painel)/locacoes/nova/*` (sempre atrás de `requireColaborador()`) ganha os campos
novos: `criarLocacaoSchema` (`lib/validacoes/locacao-assistida.ts`), `calcularResumoAction` e
`criarLocacaoAssistida`. O schema/action do portal (`validacoes/solicitacao.ts`) **não é tocado** —
associado nunca define preço, exatamente como antes.

---

## 6. UI (`nova-locacao-form.tsx`, Card "Pagamento e resumo")

- Cada linha de sala no resumo vira um campo de valor (R$) editável, pré-preenchido com a referência.
  Legenda discreta mostra a referência quando o valor foi editado, ou um aviso destacado quando não há
  referência (colaborador precisa informar o valor). Link "usar valor de referência" desfaz a edição.
- Enquanto o colaborador não edita uma sala, o campo continua sincronizado com a referência do servidor
  (muda sala/data/período/condição → o campo acompanha). A partir da primeira edição manual, o valor
  fica sob controle do colaborador até ele "restaurar" ou remover a sala da seleção.
- Bloco "Desconto": toggle + tipo (percentual/valor) + valor + motivo opcional — sempre visível,
  independente do checkbox "Lançamento retroativo".
- Guarda no client: bloqueia o envio se alguma sala selecionada ficar sem valor (não-vazio) antes de
  chegar ao servidor.

---

## 7. Fora de escopo

- Não altera o portal do associado.
- Não altera `coffee`/`adicionais`, que já eram valores digitados livremente pelo colaborador.
- Não cria vigência retroativa em `precos_sala` — a alternativa considerada e descartada, porque o
  histórico de preços da ACIMM não é uma tabela de vigências limpa.
