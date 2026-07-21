# Spec 20 — Combos no Fluxo de Locação + Período Gratuito (Bloco E, parte 4)

> Depende: Spec 04 estendido (catálogo `combos`/`combo_salas` JÁ implementado com CRUD), Specs 07/11 (`calcularValores()`).
> **Contexto real do banco:** três tipos de combo existem e têm dados: `desconto_multi_sala` (salas âncora + % off nas salas com `aplica_desconto`), `evento_privativo` (todas as salas por valor fechado em `valor_centavos`) e `assinatura_mensal` (N sessões/mês — `dias_no_mes` — por valor fixo). Este spec NÃO recria o catálogo — ele o **aplica** na locação. O desconto genérico por faixas previsto originalmente está morto: combos são o mecanismo de multi-sala.
> Período gratuito do sócio: **configurável por sala pelo colaborador e operacional desde o primeiro deploy** — havendo regra cadastrada para uma sala, o benefício funciona; sem regra, a sala simplesmente não tem gratuito.

---

## 1. Objetivo

Locações podem nascer de um combo (com cálculo, agenda e contrato coerentes com cada tipo) e o sócio ganha o benefício mensal de período gratuito — tudo discriminado nos valores, aplicado no servidor e refletido no contrato.

## 2. Migration `0026_combos_locacao`

```sql
alter table locacoes
  add column combo_id uuid references combos(id),
  add column combo_grupo_id uuid;   -- une as N locações de uma assinatura mensal
create index locacoes_combo_grupo_idx on locacoes (combo_grupo_id) where combo_grupo_id is not null;

-- período gratuito: regra POR SALA, gerida pelo colaborador
create table regras_periodo_gratuito (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid not null unique references salas(id),
  periodos periodo_dia[] not null check (array_length(periodos, 1) > 0),
  usos_por_ciclo integer not null default 1 check (usos_por_ciclo > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);
alter table regras_periodo_gratuito enable row level security;
-- leitura: colaborador (tudo) e authenticated (apenas ativas — o portal precisa exibir elegibilidade);
-- escrita: service role (padrão do projeto)

-- consumo passa a ser contado POR SALA
alter table periodos_gratuitos add column sala_id uuid references salas(id);
create index periodos_gratuitos_sala_ciclo_idx on periodos_gratuitos (associado_id, sala_id, ciclo);
```

## 3. Aplicação por tipo de combo

### 3.1 `desconto_multi_sala` (ex.: Dia de Treinamento)
- **Elegível quando** a reserva contém TODAS as salas do combo, na mesma data, e o período casa com `combo.periodo` quando definido.
- **Cálculo:** preço normal via `resolverPreco()` por sala; nas salas com `aplica_desconto = true`, aplica `desconto_valor` (`tipo_desconto` percentual ou fixo em centavos) — linha discriminada `"Combo {nome} — desconto em {sala}"`. Salas âncora pagam integral.
- Seleção: usuário escolhe o combo (§4) e o formulário trava as salas/período do combo (pré-seleciona e bloqueia remoção das obrigatórias).

### 3.2 `evento_privativo`
- Reserva de **todas as salas ativas** no período do combo, por **valor fechado**: `valor_salas_centavos = combo.valor_centavos` (substitui a soma de `resolverPreco` — que fica registrada como referência no snapshot para transparência do desconto implícito).
- Conflito: qualquer ocupação bloqueante em qualquer sala barra (mensagem indica quais salas/horários travam). `locacao_salas` recebe todas as salas com rateio proporcional do valor fechado (soma exata = valor do combo, resto no primeiro item).

### 3.3 `assinatura_mensal` (ex.: Podcast 4×/mês) — **somente fluxo assistido na v1**
- Colaborador escolhe o combo + as `dias_no_mes` datas do mês (todas validadas contra a agenda de uma vez; conflito em qualquer uma reporta e não cria nada).
- Cria **N locações** (uma por sessão, mesma sala/período do combo) unidas por `combo_grupo_id`:
  - **Principal** (primeira data): carrega `valor_salas = combo.valor_centavos` — contrato e pagamento vivem nela, com o contrato listando TODAS as datas do grupo;
  - **Vinculadas:** valor 0 com referência ao grupo; seguem a máquina de estados normalmente para agenda/lembretes, sem contrato/pagamento próprios.
- Aprovar/recusar a principal propaga ao grupo; cancelar UMA sessão vinculada não altera valores (crédito/reposição é tratativa manual da ACIMM — registrar em observações). Portal não oferece assinatura na v1 (agendamento múltiplo + relação comercial pedem humano).

### Regras transversais
- Combo × combo: uma locação tem no máximo um combo. Combo × período gratuito: **não combinam** (benefício exige sala única fora de combo).
- **Combos são EXCLUSIVOS de sócio** (decisão ACIMM): elegibilidade exige `condicao = 'associado'` com situação `ativo`, validada no servidor a cada cálculo/submit. No assistido, a aba Combos só aparece com associado selecionado; locatário externo não vê nem consegue forçar por payload.
- Reagendamento revalida a elegibilidade do combo (saiu do desenho → recalcula sem ele, com aviso antes de confirmar).

## 4. UX de seleção
- **Assistido (Spec 07):** etapa Sala/Data ganha aba **"Combos"** — cards do catálogo ativo (nome, descrição comercial, salas, preço/benefício). Selecionar configura o formulário conforme o tipo (§3). Assinatura abre o seletor de múltiplas datas.
- **Portal (Spec 11):** mesma aba com `desconto_multi_sala` e `evento_privativo` (sem assinatura). Card mostra a economia ("40% na Área Gourmet"). Fluxo segue idêntico após a seleção.
- Detalhe da locação (admin e portal): badge do combo; grupo de assinatura mostra as sessões irmãs com links.

## 5. Período gratuito do sócio (regra por sala, operacional desde já)

### 5.1 Painel — `/admin/configuracoes` seção "Período gratuito"
- Lista das regras cadastradas: sala, períodos permitidos, usos por ciclo, ativo, última alteração.
- **Adicionar regra:** select de sala ativa (sem regra ainda — uma regra por sala) + multi-select de períodos (manhã/tarde/noite/dia inteiro) + nº de usos por ciclo. Editar e ativar/desativar; sem hard delete.
- Alterações valem para **novos cálculos** (aviso fixo); `atualizado_por/em` registrados.
- Acesso do colaborador (não só admin): gestão do benefício é operação do dia a dia da equipe.

### 5.2 Elegibilidade (todas as condições, no servidor)
- Condição `associado` com situação `ativo`;
- Locação de **sala única, sem combo**;
- A sala tem regra **ativa** em `regras_periodo_gratuito`;
- Período da locação ∈ `periodos` da regra (a duração é a do próprio período — sem limite de horas separado);
- Usos do associado **naquela sala** no ciclo (mês civil da **data do evento**) < `usos_por_ciclo` da regra — contagem em `periodos_gratuitos` por (associado, sala, ciclo).

### 5.3 Aplicação e consumo
- Zera o valor da sala; coffee e adicionais seguem cobrados. Auto-aplica quando elegível, com toggle de recusa (guardar o uso para outra data do mês). Linha discriminada nos valores e no contrato ("Período gratuito do associado — {sala}").
- **Registro obrigatório do consumo** em `periodos_gratuitos` (associado, sala, locação, ciclo) na MESMA transação da criação — é ele que impede o associado de exceder o permitido, em qualquer canal (portal, assistido, reagendamento).
- `recusada`/`cancelada` devolvem o uso (delete via hook); reagendamento revalida do zero (mudou sala/período/mês → benefício entra, sai ou muda de ciclo, consumo ajustado transacionalmente); corrida do último uso resolvida por lock — um consome, o outro recalcula e reexibe o total antes de confirmar.

### 5.4 UX
- Portal/assistido: linha "Período gratuito do associado — R$ 0,00 ({uso} de {n} desta sala no mês)"; esgotado → "Benefício desta sala já utilizado no mês · renova em {01/mês+1}"; sala sem regra → nada aparece.
- Perfil do associado (Spec 12): card "Seus benefícios do mês" listando cada sala com regra ativa e o saldo (ex.: "Sala de Reunião — 1 de 1 disponível").
- Disponibilidade (Spec 10): chip livre de sala com benefício disponível para o associado ganha selo discreto "Gratuito disponível".

## 6. Critérios de aceite
- [ ] Regressão zero com tudo desligado/sem combo: cálculos idênticos aos atuais.
- [ ] Dia de Treinamento real: reserva com Cinza (integral) + Gourmet aplica 40% só na Gourmet, discriminado; remover uma sala obrigatória invalida o combo com aviso.
- [ ] Evento Privativo: trava todas as salas, valor fechado exato, rateio soma ao centavo, conflito aponta as salas ocupadas.
- [ ] Assinatura: N locações com grupo, contrato/pagamento só na principal listando as datas, propagação de aprovação/recusa, cancelamento individual sem efeito financeiro automático; indisponível no portal.
- [ ] Combos invisíveis e inaplicáveis para locatário externo (aba oculta no assistido + payload forçado rejeitado no servidor); associado suspenso/excluído também não passa.
- [ ] Combo + período gratuito impossível (server-side); um combo por locação; reagendamento revalida.
- [ ] Período gratuito por sala: CRUD de regras pelo colaborador funcional; elegibilidade respeita períodos e usos POR SALA por ciclo (mês do evento); associado no limite é barrado em qualquer canal.
- [ ] Consumo/devolução/corrida cobertos por testes; contagem em `periodos_gratuitos` (associado, sala, ciclo) bate com o exibido no perfil e nos formulários.
- [ ] Selo "Gratuito disponível" na disponibilidade aparece apenas para associado elegível na sala/período com saldo.
- [ ] Adulteração de payload (forçar combo/benefício) não afeta o gravado — recálculo servidor manda.
- [ ] Config corrompida degrada para regra inativa com alerta, nunca quebra cálculo.
