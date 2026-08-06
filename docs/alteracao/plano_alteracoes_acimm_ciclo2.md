# Plano de Alterações — Sistema de Locação de Salas (Ciclo 2)

**FacioFlow × ACIMM**
Consolida: reunião de entrega (22/07/2026), regra de comissões detalhada pela Iasmin, documento de serviços adicionais e solicitações complementares. Este documento é a fonte única para o plano de implementação.

---

## 1. Dashboard

### 1.1 Valor arrecadado com filtro temporal
Adicionar indicador de valor arrecadado no período, com filtro de datas configurável (ex.: dia 30 a dia 30), **separado entre locação de salas e coffee break**. Finalidade: relatórios da equipe à diretoria.

### 1.2 Remover comissões do painel principal
As comissões saem do dashboard (por causa do descasamento de datas do boleto da mensalidade) e ficam exclusivamente no módulo próprio (seção 5).

### 1.3 Histórico de locações
O dashboard deve dar acesso ao **histórico completo de locações**, com filtros por período, sala, associado e status. Inclui locações concluídas, canceladas e retroativas (seção 6). Cada item abre o detalhe da locação com sua timeline/checklist.

### 1.4 Exportação do mês em PDF
Botão "Exportar mês em PDF" gerando relatório mensal com: relação de locações do mês (data, sala, associado, evento, forma de pagamento, valor), subtotais separados de salas e coffee break, total geral e contagem de locações. Geração server-side, com identidade visual da ACIMM, respeitando o período do filtro ativo (1.1). É o documento que a equipe leva para a diretoria.

---

## 2. Calendário e seleção de datas

### 2.1 Coffee break no calendário
Exibir o coffee break dentro da locação no calendário **com o horário em que será servido**.

### 2.2 Indicador de ocupação mais visual
Na seleção de datas, destacar **o dia inteiro** quando houver ocupação (em vez do ponto abaixo do número), e facilitar a visualização de **data e horário em conjunto** na escolha do período.

---

## 3. Locações

### 3.1 Busca por código do associado
Adicionar busca por **código do associado** (além de nome e razão social). Essencial para a operação da planilha de boletos.

### 3.2 Mensagem de aprovação com resumo
A mensagem automática de aprovação enviada ao associado deve incluir o **resumo do pedido**: sala, período, coffee break (nível, pessoas, horário) e serviços adicionais contratados.

### 3.3 Timeline vira checklist do fluxo ideal
A timeline da locação passa a mostrar não só o que aconteceu, mas **o que ainda falta**: etapas pendentes destacadas (vermelho/bolinha) e concluídas (azul). Etapas geradas dinamicamente conforme o pedido — ex.: contrato enviado, contrato assinado, pagamento recebido, arte da divulgação aprovada (seção 8), cozinha confirmada (seção 8).

### 3.4 Campo de observações internas
Campo livre de anotações internas na locação, visível apenas para a equipe, para registros fora do escopo do formulário.

### 3.5 Lista de espera vira "Pendentes"
A lista de espera passa a operar como **reservas pendentes de confirmação** do interessado: sem substituição automática de locação, apenas **mudança de status** quando confirmada, mantendo a notificação quando a vaga abre.

---

## 4. Contratos

### 4.1 Saída do Autentique
O Autentique sai do fluxo. Novo fluxo de assinatura:
1. Sistema gera o PDF do contrato.
2. Envio ao associado **por WhatsApp** (o e-mail do cadastro não é confiável para isso — muitas vezes pertence ao financeiro/RH, não a quem loca).
3. Confirmação de assinatura por **upload da via assinada** na plataforma (associado ou equipe) **ou marcação manual** pela equipe.
4. O checklist da locação (3.3) reflete: contrato enviado → via assinada recebida.

### 4.2 Filtros no módulo de contratos
Adicionar filtros por **associado** e por **período**, mantendo o reenvio consolidado de pendências.

### 4.3 Comprovante de PIX com notificação
O upload de comprovante de PIX pelo portal também deve **notificar a equipe via WhatsApp**.

---

## 5. Comissões — nova regra de cálculo

### 5.1 Percentuais e base

| Tipo | Percentual | Base de cálculo |
|---|---|---|
| Locação de salas | 5% | Valor efetivamente recebido da sala |
| Coffee break | 3% | Valor efetivamente recebido do coffee |
| Serviços adicionais | **0% — fora da base** | Não geram comissão |

Uma locação pode ter sala + coffee + adicionais, então o cálculo é **por componente**. O subtotal de adicionais deve ficar armazenado separado dos demais justamente para ser **excluído** da base. Percentuais permanecem configuráveis, com 5%/3% como padrão.

### 5.2 Fato gerador
A comissão nasce no **recebimento do pagamento pela ACIMM**, nunca na contratação, e é paga **no mês seguinte ao recebimento**. Ordem: **Contratação → Pagamento → Comissão**. A data de contratação é apenas registro.

**Regra de quitação:** a comissão só é gerada **quando o pagamento estiver quitado**. Pagamentos parciais/parcelados não geram comissão proporcional — a competência é a data da quitação total.

**Estornos:** não existe estorno/cancelamento após pagamento. Nenhum mecanismo de abatimento é necessário.

Modelo de dados: a comissão vincula-se ao **registro de pagamento** (com `data_recebimento`/`data_quitacao` e `forma_pagamento`), não à locação. Formas: PIX, cartão, dinheiro, transferência, boleto avulso, boleto da mensalidade.

### 5.3 Tela de comissões — três visões

1. **Mês Atual (a pagar):** comissões de pagamentos **quitados no mês anterior**, independente da forma. Ex.: em julho, aparecem as comissões de pagamentos efetivados em junho, mesmo de locações fechadas em maio ou antes.
2. **Próximo Mês (previsão):** comissões dos pagamentos previstos para quitação no mês atual.
3. **Daqui a Dois Meses (previsão):** comissões de locações fechadas agora cujo pagamento será lançado no boleto da mensalidade do próximo mês.

Cada linha mantém o controle **pago / não pago**. A exportação Excel/CSV existente passa a refletir a visão selecionada. Os status anteriores (exportado/estornado) são substituídos por esse modelo.

---

## 6. Locações em datas passadas (retroativas)

1. Disponível **apenas para colaboradores** na locação assistida. No portal do associado, datas passadas continuam bloqueadas.
2. Antecedência mínima não se aplica (comportamento já existente para a equipe).
3. **Suprimir automações**: nenhuma mensagem de aprovação, cobrança ou notificação ao associado. Sem sincronização com Google Calendar para datas já passadas.
4. Entra com status **concluída**, com o checklist refletindo as etapas passadas, e permite registrar o pagamento retroativo — que alimenta normalmente a régua de comissões (seção 5) pela data de quitação.
5. Auditoria: registrar quem lançou, quando, com origem "lançamento retroativo".

---

## 7. Sobreposição de eventos

**Regra:** duas locações podem ocupar a mesma sala no mesmo período **somente quando criadas por colaborador**. Associado nunca sobrepõe. Ao detectar conflito na locação assistida, exibir **pop-up de aviso** exigindo confirmação explícita.

### 7.1 Impacto na arquitetura — atenção
A disponibilidade hoje é garantida por **exclusion constraint no PostgreSQL** (bloqueio absoluto). Mudança necessária:

1. Coluna `sobreposicao_autorizada boolean default false` na locação.
2. Exclusion constraint vira **parcial** (`WHERE NOT sobreposicao_autorizada`) — mantém o bloqueio entre locações comuns como backstop.
3. A **validação de verdade migra para o server-side** (Server Action com service-role, como as demais escritas). Motivo: com a constraint parcial, uma locação comum de associado colidindo com uma locação já sobreposta **não seria barrada pelo banco** — a checagem de conflito do associado precisa ser 100% na aplicação, sem exceções.

### 7.2 Fluxo por perfil
- **Associado (portal):** conflito = indisponível. Sem pop-up, sem caminho de exceção.
- **Colaborador (assistida):** pop-up mostra sala, período e a(s) locação(ões) existentes no horário (código, associado, evento), com ações "Cancelar" e "Confirmar sobreposição". Só grava com confirmação, marcando `sobreposicao_autorizada = true` e registrando **quem autorizou e quando**.

### 7.3 Efeitos colaterais
1. **Calendário/dashboard:** locações sobrepostas aparecem lado a lado no mesmo slot com indicador visual de sobreposição.
2. **Ocupação (2.2):** o dia continua marcado como ocupado.
3. **Eventos Sympla:** o remanejamento por prioridade trata sobreposição autorizada como conflito aceito — não tenta remanejar.

---

## 8. Serviços adicionais

### 8.1 Modelos de cobrança
A funcionalidade precisa suportar três modelos:

| Modelo | Comportamento na locação |
|---|---|
| **Por unidade** | Colaborador informa quantidade; sistema calcula `quantidade × valor unitário` |
| **Fixo por evento** | Valor único adicionado à locação |
| **Sob consulta** | Sem preço cadastrado; valor digitado manualmente na locação após cotação |

### 8.2 Cadastro
Campos: nome, descrição (vai para o contrato), modelo de cobrança, unidade (certificado, montagem, cadeira, publicação, evento), valor unitário (vazio quando sob consulta), **sala vinculada** (opcional — restringe o serviço à locação daquela sala), flags "requer aprovação prévia" e "sujeito a disponibilidade", ativo/inativo.

### 8.3 Carga inicial (documento da ACIMM)

| # | Serviço | Modelo | Valor | Configuração |
|---|---|---|---|---|
| 1 | Impressão de certificados | Por unidade (certificado) | R$ 3,50 | Descrição cita arquivo digital fornecido pelo contratante |
| 2 | Montagem personalizada da Sala Cinza | Fixo por montagem | R$ 50,00 | Vinculado à **Sala Cinza**; layout em "U", antes do evento |
| 3 | Cadeiras adicionais | Por unidade (cadeira) | R$ 10,00 | Vinculado à **Sala de Reunião** |
| 4 | Divulgação nas redes sociais da ACIMM | Por unidade (publicação) | R$ 100,00 | Flag "requer aprovação prévia": arte aprovada com logomarca da ACIMM como apoiadora; gera etapa no checklist |
| 5 | Uso da Cozinha (forno) | Fixo por locação | R$ 100,00 | Flag "sujeito a disponibilidade": não confirma automaticamente; gera etapa no checklist |
| 6 | Segurança para o evento | Fixo por evento | R$ 250,00 | — |
| 7 | Pedestal de microfone | Sob consulta | — | Valor manual após cotação |
| 8 | Banheirista | Sob consulta | — | Eventos grandes; cotação prevê 2 banheiros (manter na descrição) |

Nota: os adicionais citados na reunião (serviço simples de evento, transmissão ao vivo, técnico do auditório) não constam no documento — confirmar com o Vitor se saíram da lista ou virão em segunda leva. O cadastro é aberto, então incluí-los depois é trivial.

### 8.4 Integrações
1. **Resumo/mensagem de aprovação (3.2):** adicionais com quantidade e valor.
2. **Contrato:** cada adicional entra no PDF com descrição e valor (mesmo mecanismo dos equipamentos por tag).
3. **Cálculo server-side:** total = sala + coffee + adicionais, calculado no servidor; itens sob consulta exigem valor preenchido antes do envio para pagamento.
4. **Checklist (3.3):** flags de aprovação/disponibilidade geram etapas pendentes.
5. **Comissão (5.1):** subtotal de adicionais armazenado separado e **excluído** da base de comissão.

---

## 9. Ordem sugerida de implementação

| Fase | Itens | Justificativa |
|---|---|---|
| 1 | Seção 5 (comissões) + 3.5 | Refatoração de modelo de dados; base para o restante |
| 2 | Seção 8 (adicionais) + 3.2 + 4.1/4.2/4.3 | Adicionais alimentam contrato, resumo e checklist |
| 3 | Seção 7 (sobreposição) + 6 (retroativas) | Migração da exclusion constraint; retroativas reaproveitam a validação nova |
| 4 | Seções 1, 2, 3.1, 3.3, 3.4 | Dashboard, calendário, histórico, PDF mensal e refinamentos de UI |
