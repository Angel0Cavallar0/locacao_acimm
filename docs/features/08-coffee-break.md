# Spec 08 — Coffee Break (Fase 2, parte 6 — fecha o Bloco B)

> Depende: Spec 06 (detalhe da locação) e Spec 07 (formulário assistido — a seção de coffee dele destrava com este spec).
> Referência: CLAUDE.md §9.8, planilha atual da ACIMM (níveis Bronze/Prata/Ouro por pessoa + adicionais livres).
> Rotas: `/admin/coffee` (pedidos) e `/admin/coffee/niveis` (configuração).

---

## 1. Objetivo

Configurar os níveis de coffee (valores e composição), acompanhar os pedidos por período, gerar o **PDF consolidado de compras** e liberar a edição de coffee no detalhe da locação. O envio automático semanal do PDF via WhatsApp fica no Spec 16 — aqui nasce a função reutilizável que ele vai chamar.

---

## 2. Configuração de níveis (`/admin/coffee/niveis`)

- CRUD de `coffee_niveis`: nome (ex.: Bronze/Prata/Ouro — livre e cadastrável), **descrição** (texto do que tem no coffee), **preço por faixa de pessoas**, **itens** (composição), ativo, ordem.
- **Preço por faixa** (`faixas_preco` JSONB): `[{ min_pessoas: 8, max_pessoas: 14, valor_pessoa_centavos: 2500 }, { min_pessoas: 15, max_pessoas: null, valor_pessoa_centavos: 2000 }]`. O valor é **por pessoa dentro da faixa** — total = `valor_pessoa × pessoas`. `max_pessoas` nulo = faixa aberta ("15+"). A faixa aplicável é escolhida pelo nº de pessoas da reserva (regra em `lib/coffee/faixas-core.ts`, testada: match exato → abaixo de tudo usa a menor faixa → lacuna usa a maior faixa cujo min ≤ qtd).
- **Itens** (`composicao` JSONB): lista de itens com **quantidade fixa por pedido** (NÃO por pessoa) — `[{ item: "Mini salgado", qtd: 40, unidade: "un" }, { item: "Suco", qtd: 3000, unidade: "ml" }, …]`. Editor de linhas simples (item, quantidade, unidade). É a base do cálculo de compras (§4).
- **Alteração de preço NÃO cria vigência** (diferente de `precos_sala`): o valor do coffee é **snapshot** em `coffee_breaks.valor_centavos` no momento do cálculo da locação — mudar o nível afeta apenas locações novas ou recalculadas (reagendamento). Documentar esse contraste no código.
- Desativar nível: some das opções de novas locações; locações existentes que o usam não são afetadas (FK permanece).
- Sem hard delete (padrão do projeto).

## 3. Pedidos (`/admin/coffee`)

- Seletor de período: **Esta semana** (padrão, seg–dom), semana anterior/próxima, intervalo customizado (máx. 31 dias).
- Tabela de pedidos do período — coffee de locações cujo **evento** cai no intervalo:
  - Colunas: data/horário do evento, horário de servir, LOC-nº (link), locatário, sala(s), nível, pessoas, adicionais, valor, status da locação (badge).
  - **Filtro de status**: padrão exibe locações "firmes" (`aprovada` → `realizada`); toggle "incluir pendentes" mostra `solicitada`/`em_analise` com destaque visual (podem não se confirmar — a equipe decide se compra contando com elas).
- **Consolidado de compras do período** (card acima da tabela): soma da quantidade **fixa por pedido** de cada item dos pedidos firmes, agrupada por item/unidade — ex.: "Mini salgado: 240 un · Suco: 36 L". Adicionais listados à parte (são texto livre, não consolidam).
- Botão **"Gerar PDF de compras"** (§5) + nota "Envio automático semanal ao setor de compras: em breve" (Spec 16).

## 4. Cálculo de itens — `lib/coffee/calcular-itens.ts` (server-only)

```ts
calcularItensCoffee(pedidos: PedidoCoffee[]): ConsolidadoCompras
// soma da quantidade FIXA de cada item por pedido → agregação por (item, unidade)
// (não multiplica por pessoas — a quantidade do item já é o total do pedido)
// converte unidades óbvias para exibição (ml→L quando ≥ 1000; g→kg quando ≥ 1000)
```
Função pura com testes unitários (agregação, conversão de unidade, período sem pedidos). O preço por faixa fica em `lib/coffee/faixas-core.ts` (também puro e testado).

## 5. PDF de compras — `lib/coffee/pdf-compras.tsx`

- **`@react-pdf/renderer`** (gera no servidor, tamanho pequeno — sem problema com limites da Vercel).
- Conteúdo: cabeçalho com identidade ACIMM (tokens/logo — sem menção a ferramentas), período, **consolidado de compras**, depois detalhamento por evento (data, horário de servir, sala, locatário, nível, pessoas, adicionais, observações).
- Assinatura da função: `gerarPdfCompras(intervalo, opcoes): Promise<Buffer>` — **reutilizável pelo cron do Spec 16** (mesmo PDF, geração manual ou automática).
- Na tela: server action gera e retorna para download (`application/pdf`); inclui apenas pedidos firmes (pendentes ficam fora do PDF sempre — documento de compra não especula).

## 6. Coffee no detalhe da locação (destrava a seção do Spec 06)

- Seção Coffee do detalhe ganha ações **enquanto status ≤ `aprovada`** (mesma regra dos adicionais):
  - Adicionar coffee (locação sem coffee), editar (nível, pessoas, horário de servir, adicionais, observações) e remover.
  - Toda mudança recalcula via `calcularValores()` (Spec 07 §4) e registra em `locacao_eventos` (`dados` com antes/depois).
- A partir de `contrato_enviado`: somente leitura (valores congelados no contrato), com a explicação na UI.
- Formulário assistido (Spec 07 §3.3): seção de coffee passa a aparecer assim que houver nível ativo — sem mudança de código lá, só o cadastro.

## 7. Critérios de aceite
- [ ] CRUD de níveis com editor de composição; valores em centavos; desativar não afeta locações existentes.
- [ ] Alterar valor de nível não muda `valor_centavos` de coffee já calculado (teste explícito de snapshot).
- [ ] Pedidos da semana corretos por data do **evento**; filtro de pendentes com destaque; consolidado bate com a soma manual (testes de `calcularItensCoffee`).
- [ ] PDF gerado com consolidado + detalhamento, apenas pedidos firmes, identidade ACIMM, sem stack exposta.
- [ ] `gerarPdfCompras()` chamável fora da rota (assinatura pronta para o cron do Spec 16).
- [ ] Coffee editável no detalhe até `aprovada`, com recálculo server-side e linha do tempo; travado e explicado a partir de `contrato_enviado`.
- [ ] Seção de coffee do formulário assistido aparece automaticamente após cadastrar o primeiro nível ativo.
