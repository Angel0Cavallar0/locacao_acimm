-- Migration 0019 — Combos de locação (Spec 04, extensão)
-- Gestão de pacotes: desconto multi-sala, assinatura mensal e evento privativo
-- (locação de todas as salas). A aplicação no cálculo de locação é fase futura.

create type tipo_combo as enum (
  'desconto_multi_sala',
  'assinatura_mensal',
  'evento_privativo'
);
create type tipo_desconto as enum ('percentual', 'valor');

create table combos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  tipo tipo_combo not null,
  -- desconto_multi_sala: percentual (0-100) ou valor (centavos)
  tipo_desconto tipo_desconto,
  desconto_valor integer check (desconto_valor is null or desconto_valor >= 0),
  -- assinatura_mensal / evento_privativo: valor fechado (centavos)
  valor_centavos integer check (valor_centavos is null or valor_centavos >= 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger combos_set_atualizado_em
  before update on combos
  for each row execute function set_atualizado_em();

-- Salas do combo. Vazio em evento_privativo = todas as salas.
create table combo_salas (
  id uuid primary key default gen_random_uuid(),
  combo_id uuid not null references combos(id) on delete cascade,
  sala_id uuid not null references salas(id) on delete cascade,
  aplica_desconto boolean not null default false, -- sala onde o desconto incide
  unique (combo_id, sala_id)
);

alter table combos enable row level security;
alter table combo_salas enable row level security;

create policy combos_colaborador_select on combos for select to authenticated
  using (eh_colaborador());
create policy combo_salas_colaborador_select on combo_salas for select to authenticated
  using (eh_colaborador());
