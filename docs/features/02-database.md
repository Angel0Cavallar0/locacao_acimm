# Spec 02 — Banco de Dados (Fase 1)

> Projeto Supabase: `acimm_db` (`sowkwmpfjkbntlykoahr`, sa-east-1, Postgres 17).
> Acesse o projeto via MCP do supabase
> Quando aprovado, aplicar via arquivos versionados em `supabase/migrations/` (nunca DDL avulso pelo dashboard).

---

## 1. Estado atual (já existe — NÃO recriar, NÃO alterar)

Analisado em 16/07/2026 direto no projeto:

### Tabelas
- **`colaboradores`** (0 linhas): `id`, `user_id → auth.users` (unique), `nome`, `email` (unique), `role` (`role_colaborador`: `admin` | `colaborador`), `ativo`, `criado_em`. RLS on; policy `colaboradores_self_select` (usuário lê o próprio registro).
- **`associados`** (~1.968 linhas — sync Sophus do n8n JÁ operacional): espelho rico do Sophus com `codigo_sophus` (unique), `nome`, `razao_social`, `tipo_documento` (`CPF`|`CNPJ`), `documento` (**não-único** — duplicatas legítimas na base Sophus; check de 11/14 dígitos), `documento_valido`, endereço completo, `email_raw` + `emails text[]` (Sophus entrega múltiplos e-mails separados por "/" — já normalizado), `telefone`/`celular`/`whatsapp`/`contato`, `ramo`/`ramo_descricao`, `situacao` (`situacao_associado`: `ativo` | `suspenso` | `excluido`), `ativo` (**coluna gerada** de `situacao` — somente leitura), `eh_entidade_rede`, `user_id → auth.users` (unique, nullable — preenchido quando o associado cria conta), `visto_em` (controle de ausentes no retorno do Sophus), `sincronizado_em`, timestamps.
  - Índices: busca full-text `portuguese` com `imm_unaccent(nome || razao_social)` (GIN), GIN em `emails`, parciais por situação/aptidão, btree em `documento`.
  - Policies: `associados_colaborador_select` (colaborador lê todos), `associados_self_select` (associado lê o próprio).

### Enums existentes
`role_colaborador`, `situacao_associado`, `tipo_documento`.

### Funções/triggers existentes
`imm_unaccent(text)`, `inativar_associados_ausentes(timestamptz)`, `set_atualizado_em()` (trigger em `associados`).

### Extensões instaladas
`pgcrypto`, `uuid-ossp`, `unaccent`, `pg_stat_statements`, `supabase_vault`.

### Padrão de escrita vigente
Não há policies de INSERT/UPDATE/DELETE — escritas acontecem só via service role (n8n). **Manteremos esse padrão para todo o domínio** (ver §6).

---

## 2. Decisões de arquitetura do schema

1. **Escrita 100% via service role.** Nenhuma policy de escrita para `authenticated`. Toda mutação passa por server action que valida sessão/role/regras (CLAUDE.md §4) e usa o client `admin`. RLS existe para **leitura** com privilégio mínimo. Benefício: máquina de estados e recálculo de preço nunca podem ser contornados pelo client.
2. **Disponibilidade centralizada em `agenda_ocupacoes`.** Locações e eventos internos são fontes diferentes de ocupação da mesma agenda. Uma única tabela, mantida por trigger, carrega a **constraint de exclusão** (`btree_gist`): impossível haver duas ocupações bloqueantes sobrepostas na mesma sala, mesmo sob corrida. É a última linha de defesa; a validação amigável acontece antes, na aplicação.
3. **Solicitação pendente não bloqueia a agenda no banco, mas bloqueia novas solicitações pelo portal.** `solicitada`/`em_analise` entram em `agenda_ocupacoes` com `bloqueante = false`. No **portal do associado**, horário com pendência sobreposta exibe informativo ("já solicitado, aguardando aprovação") e oferece **fila de espera** — a aplicação não cria solicitação concorrente. No **painel do colaborador**, sobreposições pendentes aparecem com alerta visual (a responsável administra; o atendimento assistido pode criar mesmo assim). O hard-block da constraint começa em `aprovada`; a exclusão (erro `23P01`) na aprovação é traduzida em notificação clara ao usuário. Eventos internos são sempre bloqueantes (a prioridade governa *remanejamento*, não bloqueio); conflito de associado com evento ACIMM gera **convite ao evento** + orientação de contato (CLAUDE.md §8.3c).
4. **Multi-sala nativo.** `locacoes` guarda o período e os totais; `locacao_salas` (junção) guarda cada sala com seu valor. O desconto multi-sala incide na locação.
5. **Snapshot do locatário na locação.** Mesmo quando `associado_id` está preenchido, os campos `locatario_*` são gravados (nome/documento/e-mail/telefone que vão ao contrato). Cobre locação em nome de terceiro e congela os dados no tempo (o espelho Sophus muda a cada sync).
6. **Dinheiro em centavos (`integer`), tempo em `timestamptz`/`tstzrange`.** Valores sempre calculados no servidor.
7. **Formulário dinâmico com respostas em JSONB.** `campos_formulario` define os campos extras (editor do colaborador); respostas ficam em `locacoes.respostas_formulario` — sem junção, sem migração a cada campo novo.
8. **Auditoria insert-only.** `locacao_eventos` não tem UPDATE/DELETE nem para service role (revogar).

---

## 3. Extensões a habilitar (migration 0002)

```sql
create extension if not exists btree_gist;  -- exclusão sala_id + período
create extension if not exists pg_cron;     -- agendamentos (CLAUDE.md §2.1)
create extension if not exists pg_net;      -- chamadas HTTP dos jobs
```

## 4. Enums novos (migration 0003)

```sql
create type periodo_dia        as enum ('manha','tarde','noite','dia_inteiro');
create type condicao_locatario as enum ('associado','nao_associado');
create type status_locacao     as enum ('rascunho','solicitada','em_analise','aprovada',
  'contrato_enviado','contrato_assinado','aguardando_pagamento','confirmada',
  'realizada','finalizada','recusada','cancelada');
create type forma_pagamento    as enum ('pix','boleto_avulso','boleto_mensalidade','isento');
create type status_pagamento   as enum ('pendente','pago','isento','estornado');
create type status_contrato    as enum ('pendente','enviado','assinado','recusado','cancelado');
create type prioridade_evento  as enum ('alta','media','baixa');
create type origem_ocupacao    as enum ('locacao','evento_interno','bloqueio');
create type canal_notificacao  as enum ('whatsapp','email');
create type status_notificacao as enum ('pendente','enviada','falha');
create type origem_comissao    as enum ('locacao','coffee');
create type tipo_campo         as enum ('texto','texto_longo','numero','selecao','multiselecao','booleano','data');
```

## 5. Tabelas novas

Todas com `id uuid primary key default gen_random_uuid()`, `criado_em timestamptz not null default now()`; onde indicado, `atualizado_em` + trigger `set_atualizado_em()` (função já existe). SQL de referência — a migration final pode ajustar detalhes, não a semântica.

### 5.1 Salas e preços (migration 0004)

```sql
create table salas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  capacidade integer not null check (capacidade > 0),
  equipamentos text[] not null default '{}',
  fotos text[] not null default '{}',
  ativa boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table precos_sala (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid not null references salas(id) on delete cascade,
  condicao condicao_locatario not null,
  periodo periodo_dia not null,
  dias_semana smallint[] not null check (dias_semana <@ array[0,1,2,3,4,5,6]::smallint[] and array_length(dias_semana,1) > 0), -- 0=domingo
  valor_centavos integer not null check (valor_centavos >= 0),
  vigencia daterange not null default daterange(current_date, null, '[)'),
  criado_em timestamptz not null default now()
);
create index precos_sala_lookup_idx on precos_sala (sala_id, condicao, periodo);
```
Reajuste = fechar a `vigencia` da linha atual e criar linha nova (histórico preservado). A aplicação resolve o preço vigente na data do evento.

### 5.2 Locações (migration 0005)

```sql
create table locacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,     -- referência humana (LOC-000123 na UI)
  condicao condicao_locatario not null,
  associado_id uuid references associados(id),
  check (condicao <> 'associado' or associado_id is not null),
  -- snapshot do locatário (vai ao contrato; cobre terceiro e não-associado)
  locatario_nome text not null,
  locatario_documento text not null check (locatario_documento ~ '^\d{11}$|^\d{14}$'),
  locatario_email text not null,
  locatario_telefone text not null,
  -- evento
  inicio timestamptz not null,
  fim timestamptz not null,
  check (fim > inicio),
  qtd_pessoas integer not null check (qtd_pessoas > 0),
  tipo_evento text,
  observacoes text,
  respostas_formulario jsonb not null default '{}',
  -- valores (centavos, sempre calculados no servidor)
  valor_salas_centavos integer not null default 0,
  valor_coffee_centavos integer not null default 0,
  valor_adicionais_centavos integer not null default 0,
  valor_descontos_centavos integer not null default 0,
  valor_total_centavos integer not null default 0,
  periodo_gratuito_aplicado boolean not null default false,
  forma_pagamento_preferida forma_pagamento,
  -- fluxo
  status status_locacao not null default 'solicitada',
  motivo_encerramento text,                              -- recusa/cancelamento
  criado_por uuid references auth.users(id),             -- quem abriu (associado ou colaborador assistido)
  google_event_id text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index locacoes_status_idx on locacoes (status);
create index locacoes_associado_idx on locacoes (associado_id);
create index locacoes_inicio_idx on locacoes (inicio);

create table locacao_salas (
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null references locacoes(id) on delete cascade,
  sala_id uuid not null references salas(id),
  valor_centavos integer not null check (valor_centavos >= 0),
  unique (locacao_id, sala_id)
);

create table locacao_adicionais (
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null references locacoes(id) on delete cascade,
  descricao text not null,                               -- "Hora extra", "Organização de sala"…
  quantidade numeric not null default 1 check (quantidade > 0),
  valor_unitario_centavos integer not null check (valor_unitario_centavos >= 0),
  criado_em timestamptz not null default now()
);

create table locacao_eventos (                           -- auditoria insert-only
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null references locacoes(id) on delete cascade,
  de status_locacao,
  para status_locacao not null,
  autor_user_id uuid references auth.users(id),          -- null = sistema
  observacao text,
  dados jsonb,
  criado_em timestamptz not null default now()
);
revoke update, delete on locacao_eventos from anon, authenticated, service_role;
```

### 5.3 Agenda e conflitos (migration 0006) — coração da disponibilidade

```sql
create table eventos_internos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  sala_id uuid not null references salas(id),
  inicio timestamptz not null,
  fim timestamptz not null,
  check (fim > inicio),
  prioridade prioridade_evento not null default 'media', -- alta = não remaneja
  sympla_event_id text,
  qtd_inscritos integer,
  sincronizado_em timestamptz,
  google_event_id text,
  cancelado boolean not null default false,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table agenda_ocupacoes (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid not null references salas(id),
  periodo tstzrange not null,
  origem origem_ocupacao not null,
  locacao_id uuid references locacoes(id) on delete cascade,
  evento_interno_id uuid references eventos_internos(id) on delete cascade,
  bloqueante boolean not null default true,
  check ((origem = 'locacao') = (locacao_id is not null)),
  check ((origem = 'evento_interno') = (evento_interno_id is not null)),
  constraint agenda_sem_sobreposicao
    exclude using gist (sala_id with =, periodo with &&) where (bloqueante)
);
create index agenda_ocupacoes_periodo_idx on agenda_ocupacoes using gist (sala_id, periodo);
```

**Sincronização por triggers** (funções `security definer` na migration):
- `locacoes`/`locacao_salas`: ao inserir/atualizar, refazer as linhas de `agenda_ocupacoes` da locação — uma por sala, `periodo = tstzrange(inicio, fim)`, `bloqueante = status in ('aprovada','contrato_enviado','contrato_assinado','aguardando_pagamento','confirmada','realizada')`. `recusada`/`cancelada`/`finalizada` removem as linhas.
- `eventos_internos`: insert/update mantém linha própria (`bloqueante = not cancelado`).
- A transição `em_analise → aprovada` é o momento em que a exclusão pode falhar (23P01): a server action traduz para o fluxo de conflito da UI (segunda data / lista de espera / convite ao evento).
- `origem = 'bloqueio'` permite ao colaborador bloquear sala manualmente (manutenção etc.) sem criar evento.

### 5.4 Coffee break (migration 0007)

```sql
create table coffee_niveis (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,                             -- Bronze, Prata, Ouro (cadastrável)
  valor_pessoa_centavos integer not null check (valor_pessoa_centavos >= 0),
  composicao jsonb not null default '[]',                -- itens por pessoa, base do PDF de compras
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table coffee_breaks (
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null unique references locacoes(id) on delete cascade,
  nivel_id uuid not null references coffee_niveis(id),
  qtd_pessoas integer not null check (qtd_pessoas > 0),
  horario_servir timestamptz,
  adicionais jsonb not null default '[]',                -- [{descricao, valor_centavos}]
  observacoes text,
  valor_centavos integer not null default 0,
  criado_em timestamptz not null default now()
);
```

### 5.5 Contratos e pagamentos (migration 0008)

```sql
create table contratos (
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null references locacoes(id) on delete cascade,
  autentique_id text unique,
  status status_contrato not null default 'pendente',
  link_assinatura text,
  pdf_url text,                                          -- Storage: bucket 'contratos' (privado)
  enviado_em timestamptz,
  assinado_em timestamptz,
  criado_em timestamptz not null default now()
);

create table pagamentos (
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null references locacoes(id) on delete cascade,
  descricao text not null,                               -- "Locação", "Coffee" (híbridos: N por locação)
  forma forma_pagamento not null,
  valor_centavos integer not null check (valor_centavos >= 0),
  status status_pagamento not null default 'pendente',
  comprovante_url text,                                  -- Storage: bucket 'comprovantes' (privado)
  baixa_por uuid references auth.users(id),              -- baixa manual (v1)
  baixa_em timestamptz,
  criado_em timestamptz not null default now()
);
```

### 5.6 Apoio ao negócio (migration 0009)

```sql
create table lista_espera (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid references salas(id),                     -- null = qualquer sala
  data date not null,
  associado_id uuid references associados(id),
  nome text not null,
  contato text not null,
  observacoes text,
  convertido_locacao_id uuid references locacoes(id),
  criado_em timestamptz not null default now()           -- ordem de chegada
);
create index lista_espera_fila_idx on lista_espera (data, criado_em) where convertido_locacao_id is null;

create table periodos_gratuitos (
  id uuid primary key default gen_random_uuid(),
  associado_id uuid not null references associados(id),
  locacao_id uuid not null unique references locacoes(id) on delete cascade,
  ciclo date not null,                                   -- 1º dia do mês de competência
  horas numeric not null check (horas > 0),
  criado_em timestamptz not null default now()
);
create index periodos_gratuitos_ciclo_idx on periodos_gratuitos (associado_id, ciclo);

create table comissoes (
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null references locacoes(id),
  origem origem_comissao not null,
  valor_centavos integer not null check (valor_centavos >= 0),
  competencia date not null,                             -- 1º dia do mês
  exportada boolean not null default false,
  criado_em timestamptz not null default now()
);

create table campos_formulario (
  id uuid primary key default gen_random_uuid(),
  rotulo text not null,
  tipo tipo_campo not null,
  opcoes jsonb not null default '[]',                    -- para selecao/multiselecao
  obrigatorio boolean not null default false,
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table configuracoes (
  chave text primary key,                                -- 'desconto_multi_sala', 'periodo_gratuito', 'comissao'…
  valor jsonb not null,
  descricao text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);
```

### 5.7 Infra da aplicação (migration 0010)

```sql
create table google_conexoes (                           -- linha única: conta Google da ACIMM
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  conta_email text not null,
  calendario_id text not null default 'primary',
  refresh_token_cifrado text not null,                   -- AES-GCM com TOKEN_ENCRYPTION_KEY (cifrado na aplicação)
  status text not null default 'ativa',
  conectado_por uuid references auth.users(id),
  atualizado_em timestamptz not null default now()
);

create table notificacoes (                              -- log + fila com retry
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid references locacoes(id) on delete set null,
  canal canal_notificacao not null,
  destinatario text not null,
  template text not null,
  payload jsonb not null default '{}',
  status status_notificacao not null default 'pendente',
  tentativas integer not null default 0,
  ultimo_erro text,
  enviada_em timestamptz,
  criado_em timestamptz not null default now()
);
create index notificacoes_fila_idx on notificacoes (criado_em) where status = 'pendente';
```

---

## 6. RLS (migration 0011)

Habilitar RLS em TODAS as tabelas novas. Função auxiliar:

```sql
create or replace function eh_colaborador() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from colaboradores where user_id = auth.uid() and ativo);
$$;
```

Matriz de leitura (nenhuma policy de escrita — §2.1):

| Tabela | Colaborador (`eh_colaborador()`) | Associado (dono) | Observação |
|---|---|---|---|
| `salas`, `coffee_niveis`, `campos_formulario` | select | select (`authenticated`, apenas `ativa`/`ativo = true`) | catálogo |
| `precos_sala` | select | select (vigentes) | associado vê preço para cálculo em tela |
| `locacoes` | select | select onde `associado_id` ∈ `associados.user_id = auth.uid()` | |
| `locacao_salas`, `locacao_adicionais`, `coffee_breaks`, `contratos`, `pagamentos`, `locacao_eventos` | select | select via join na locação própria | |
| `agenda_ocupacoes` | select | **sem policy** — associado consulta pela view abaixo | não vazar `locacao_id` de terceiros |
| `eventos_internos`, `lista_espera`, `periodos_gratuitos`, `comissoes`, `configuracoes`, `notificacoes`, `google_conexoes` | select | — | interno |

Disponibilidade do associado (sem expor dados de terceiros — CLAUDE.md §13). A view distingue os três estados da regra de conflito (§8.3 do CLAUDE.md) e expõe o evento ACIMM para o convite, mas **nunca** dados de locações de terceiros:

```sql
create view disponibilidade with (security_invoker = false) as
  select
    o.sala_id,
    o.periodo,
    case
      when o.origem = 'evento_interno' then 'evento_acimm'
      when o.bloqueante             then 'ocupado'
      else                               'solicitado'      -- pendente de aprovação
    end as situacao,
    e.titulo         as evento_titulo,                     -- null exceto evento ACIMM
    e.sympla_event_id as evento_sympla_id
  from agenda_ocupacoes o
  left join eventos_internos e on e.id = o.evento_interno_id;
grant select on disponibilidade to authenticated;
```

Comportamento na aplicação a partir da view: `ocupado` → segunda data/lista de espera; `solicitado` → informativo + fila de espera (portal não cria solicitação concorrente); `evento_acimm` → convite ao evento (título + link Sympla quando houver) e orientação para contatar a ACIMM se a sala específica for imprescindível.

## 7. Storage (migration 0012 ou via dashboard versionado)

Buckets privados `contratos` e `comprovantes`; acesso somente por URL assinada gerada em server action (colaborador: qualquer; associado: apenas da própria locação). Nenhum bucket público.

## 8. Ordem de aplicação

`0002_extensoes` → `0003_enums` → `0004_salas_precos` → `0005_locacoes` → `0006_agenda` → `0007_coffee` → `0008_contratos_pagamentos` → `0009_apoio_negocio` → `0010_infra_app` → `0011_rls` → `0012_storage`.

Jobs pg_cron (CLAUDE.md §2.1) **não entram agora** — dependem das rotas `/api/cron/*` existirem (specs das Fases 4/5).

## 9. Pendências que afetam o schema (não bloqueiam)

- Regras exatas de desconto multi-sala, período gratuito e comissão → entram como linhas de `configuracoes` (seed posterior), schema já as comporta.
- Composição dos níveis de coffee → `coffee_niveis.composicao` (seed posterior).
- Salas e preços reais → cadastrados pelo painel (Spec 04), não por seed de código.

## 10. Critérios de aceite

- [ ] Migrations 0002–0012 escritas em `supabase/migrations/`, aplicáveis em sequência num banco limpo E no projeto atual sem tocar em `colaboradores`/`associados`.
- [ ] `agenda_sem_sobreposicao` impede duas ocupações bloqueantes sobrepostas (testar com transações concorrentes).
- [ ] Triggers mantêm `agenda_ocupacoes` coerente em todas as transições de status.
- [ ] Com usuário `authenticated` associado: lê apenas as próprias locações/contratos/pagamentos; vê disponibilidade só pela view (com `situacao` correta em `ocupado`/`solicitado`/`evento_acimm` e sem qualquer dado de locação de terceiro); não lê tabelas internas.
- [ ] Tentativa de solicitar horário com pendência sobreposta pelo portal é recusada pela server action com o informativo + oferta de fila de espera (registro em `lista_espera`).
- [ ] Com usuário colaborador: lê tudo; não escreve nada diretamente (escrita falha sem service role).
- [ ] `locacao_eventos` rejeita UPDATE/DELETE inclusive via service role.
