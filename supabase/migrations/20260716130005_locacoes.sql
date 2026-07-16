-- Migration 0005 — Locações e auditoria (Spec 02 §5.2)

create table locacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,      -- referência humana (LOC-000123 na UI)
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
  motivo_encerramento text,                               -- recusa/cancelamento
  criado_por uuid references auth.users(id),              -- quem abriu (associado ou colaborador assistido)
  google_event_id text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index locacoes_status_idx on locacoes (status);
create index locacoes_associado_idx on locacoes (associado_id);
create index locacoes_inicio_idx on locacoes (inicio);

create trigger locacoes_set_atualizado_em
  before update on locacoes
  for each row execute function set_atualizado_em();

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
  descricao text not null,                                -- "Hora extra", "Organização de sala"…
  quantidade numeric not null default 1 check (quantidade > 0),
  valor_unitario_centavos integer not null check (valor_unitario_centavos >= 0),
  criado_em timestamptz not null default now()
);

create table locacao_eventos (                            -- auditoria insert-only
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null references locacoes(id) on delete cascade,
  de status_locacao,
  para status_locacao not null,
  autor_user_id uuid references auth.users(id),           -- null = sistema
  observacao text,
  dados jsonb,
  criado_em timestamptz not null default now()
);

-- Auditoria imutável: nem service role pode alterar/remover (§2.8, §5.2)
revoke update, delete on locacao_eventos from anon, authenticated, service_role;
