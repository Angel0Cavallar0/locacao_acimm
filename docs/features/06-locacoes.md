# Spec 06 — Locações: Lista, Detalhe e Máquina de Estados (Fase 2, parte 4)

> Depende: Spec 04 (salas/preços) e Spec 05 (calendário — os stubs de "Abrir locação" passam a apontar para cá).
> Referência: CLAUDE.md §9.4, §8. Rotas: `/admin/locacoes`, `/admin/locacoes/[id]`.
> A criação de locação (atendimento assistido) é o Spec 07; aqui tratamos consulta e operação do ciclo de vida.

---

## 1. Objetivo

Substituir o acompanhamento da planilha: lista filtrável de todas as locações, detalhe com linha do tempo auditável e a **máquina de estados** — o único caminho para mudar o status de uma locação. Enquanto as automações não existem (Specs 13/15), o colaborador avança os status manualmente, com tudo registrado.

---

## 2. Máquina de estados (`lib/locacoes/maquina-estados.ts` — server-only)

### 2.1 Transições permitidas

```
solicitada  → em_analise | aprovada | recusada | cancelada
em_analise  → aprovada | recusada | cancelada
aprovada    → contrato_enviado | cancelada
contrato_enviado → contrato_assinado | cancelada
contrato_assinado → aguardando_pagamento | cancelada
aguardando_pagamento → confirmada | cancelada
confirmada  → realizada | cancelada
realizada   → finalizada
```

Qualquer transição fora do mapa é rejeitada com erro claro. `recusada`/`cancelada`/`finalizada` são terminais. `recusar` e `cancelar` exigem `motivo` (gravado em `motivo_encerramento`).

### 2.2 Função única de transição

```ts
transicionarLocacao(input: {
  locacaoId: string;
  para: StatusLocacao;
  motivo?: string;
  observacao?: string;
}): Promise<Resultado>
```

Sequência interna (transacional): guard `requireColaborador()` → carrega locação com lock (`select … for update`) → valida transição no mapa → executa (update de status; triggers da agenda reagem sozinhos) → insere `locacao_eventos` (de, para, autor, observação) → dispara **hooks de efeitos** → revalida paths.

### 2.3 Hooks de efeitos (preparação para as automações)

Registro `efeitosPosTransicao: Partial<Record<StatusLocacao, EfeitoFn[]>>` em `lib/locacoes/efeitos.ts`. Neste spec, todos **no-op com log**. Specs futuros apenas registram funções aqui, sem tocar na máquina:
- `aprovada` → gerar contrato + enviar Autentique (Spec 13); notificar (Spec 15); espelhar no Google Calendar (Spec 18).
- `confirmada` → notificação final + convite de agenda (15/18).
- `recusada`/`cancelada` → notificar com motivo (15); remover/atualizar evento no Calendar (18).
- Falha de efeito **não desfaz a transição** (registra em log/`notificacoes` para retry) — efeitos são pós-commit.

### 2.4 Aprovação e conflito (23P01)

Na transição para `aprovada`, o trigger torna a ocupação bloqueante e a constraint `agenda_sem_sobreposicao` pode disparar. Capturar `23P01` e responder com erro amigável **incluindo o ocupante** (consulta à `agenda_ocupacoes` sobreposta: "Sala Azul já ocupada em 14/08 14h–18h por LOC-000042 / evento X / bloqueio Y"). A transição não acontece; o colaborador resolve via reagendamento, recusa ou lista de espera.

### 2.5 Reagendamento

Server action `reagendarLocacao` (data/horário e/ou salas) permitida apenas em `solicitada | em_analise | aprovada`:
- Recalcula TODOS os valores via `resolverPreco()` (nunca aproveita valor antigo);
- Revalida conflito (mesmo tratamento 23P01);
- Registra em `locacao_eventos` (`dados` com antes/depois de período, salas e valores);
- A partir de `contrato_enviado` é proibido (contrato reflete dados congelados): o caminho é cancelar e recriar — a UI explica isso.

---

## 3. Lista (`/admin/locacoes`)

- Tabela (shadcn `table`) com colunas espelhando o acompanhamento da planilha atual: nº (LOC-000123), data/horário do evento, locatário (nome + badge associado/não-associado), sala(s), status (badge com cor por grupo: pendente/andamento/concluída/encerrada), valor total, forma de pagamento, criada em.
- Filtros combináveis persistidos na URL: status (multi), sala, intervalo de datas do evento, condição, forma de pagamento; busca por nº, nome do locatário ou documento.
- Ordenação por data do evento (padrão: próximas primeiro) e criação; paginação server-side (25/página).
- Visões rápidas (tabs sobre o mesmo filtro): **Pendentes** (solicitada/em_analise — padrão), **Em andamento**, **Próximas 7 dias**, **Todas**.
- Linha clicável → detalhe. Ações em massa: nenhuma (decisão: transição é sempre individual e consciente).

## 4. Detalhe (`/admin/locacoes/[id]`)

Layout em duas colunas (empilha no mobile):

**Coluna principal**
- Cabeçalho: LOC-nº, badge de status, criada por/em.
- **Ações contextuais ao status** (apenas transições válidas aparecem):
  - `solicitada`: Analisar · Aprovar · Recusar
  - `em_analise`: Aprovar · Recusar
  - `aprovada`: Marcar contrato enviado · Cancelar · Reagendar
  - `contrato_enviado`: Marcar contrato assinado · Cancelar
  - `contrato_assinado`: Enviar p/ pagamento · Cancelar
  - `aguardando_pagamento`: Confirmar locação · Cancelar
  - `confirmada`: Marcar realizada · Cancelar
  - `realizada`: Finalizar
  - Recusar/Cancelar abrem dialog com motivo obrigatório; Aprovar mostra resumo de confirmação (sala, horário, valor) antes de executar.
  - Rótulos "Marcar…" deixam claro que é registro manual — quando as automações chegarem (13/15), esses avanços passam a ser automáticos e os botões viram fallback.
- **Dados do evento:** sala(s) com valores individuais, data/horário, nº de pessoas, tipo, observações, respostas do formulário dinâmico (chave→valor).
- **Locatário (snapshot):** nome, documento formatado, e-mail, telefone; link para o associado vinculado quando houver.
- **Valores:** locação + coffee + adicionais − descontos = total (sempre dos campos calculados; nada recalculado no client).
- **Adicionais:** lista com adicionar/editar/remover **enquanto status ≤ `aprovada`** — cada mudança recalcula totais no servidor e registra em `locacao_eventos`.
- **Coffee / Contrato / Pagamentos:** seções somente-leitura com o que existir; placeholders "disponível em breve" para ações (Specs 08/13/14).

**Coluna lateral**
- **Linha do tempo** (`locacao_eventos` desc): transição, autor (nome do colaborador ou "Sistema" ou "Associado"), data/hora, observação/motivo. Reagendamentos mostram antes→depois.
- Atalho "Ver no calendário" (calendário com a data e sala focadas via querystring).

## 5. Segurança
- Todas as actions com guard + Zod; transição sempre via `transicionarLocacao` (nenhum update direto de `status` em lugar algum do código — critério de revisão).
- Lock `for update` impede corrida de dois colaboradores transicionando simultaneamente.
- RLS já cobre leitura; escrita via service role (padrão do projeto).

## 6. Critérios de aceite
- [ ] Mapa de transições respeitado; transição inválida rejeitada com mensagem clara; terminais não oferecem ações.
- [ ] Aprovação com conflito retorna erro amigável identificando o ocupante; nada muda no banco.
- [ ] Recusa/cancelamento exigem motivo; motivo aparece na linha do tempo e em `motivo_encerramento`.
- [ ] Reagendamento recalcula valores via `resolverPreco()`, revalida conflito e registra antes/depois; bloqueado a partir de `contrato_enviado` com explicação na UI.
- [ ] Linha do tempo reflete toda ação (transições, reagendamentos, adicionais) com autor correto.
- [ ] Filtros/busca/paginação server-side funcionais e persistidos na URL; tab Pendentes como padrão.
- [ ] Nenhum `update` de `status` fora da máquina de estados (busca no código confirma).
- [ ] Dois colaboradores agindo simultaneamente na mesma locação: segunda ação falha com "estado mudou, recarregue" (teste de concorrência).
