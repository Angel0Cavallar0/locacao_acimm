-- Migration 0004 — Salas e preços (Spec 02 §5.1)

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

create trigger salas_set_atualizado_em
  before update on salas
  for each row execute function set_atualizado_em();

create table precos_sala (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid not null references salas(id) on delete cascade,
  condicao condicao_locatario not null,
  periodo periodo_dia not null,
  -- 0=domingo … 6=sábado
  dias_semana smallint[] not null
    check (dias_semana <@ array[0,1,2,3,4,5,6]::smallint[] and array_length(dias_semana,1) > 0),
  valor_centavos integer not null check (valor_centavos >= 0),
  vigencia daterange not null default daterange(current_date, null, '[)'),
  criado_em timestamptz not null default now()
);

create index precos_sala_lookup_idx on precos_sala (sala_id, condicao, periodo);
