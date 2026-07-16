-- Migration 0007 — Coffee break (Spec 02 §5.4)

create table coffee_niveis (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,                              -- Bronze, Prata, Ouro (cadastrável)
  valor_pessoa_centavos integer not null check (valor_pessoa_centavos >= 0),
  composicao jsonb not null default '[]',                 -- itens por pessoa, base do PDF de compras
  ativo boolean not null default true,
  ordem integer not null default 0,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger coffee_niveis_set_atualizado_em
  before update on coffee_niveis
  for each row execute function set_atualizado_em();

create table coffee_breaks (
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null unique references locacoes(id) on delete cascade,
  nivel_id uuid not null references coffee_niveis(id),
  qtd_pessoas integer not null check (qtd_pessoas > 0),
  horario_servir timestamptz,
  adicionais jsonb not null default '[]',                 -- [{descricao, valor_centavos}]
  observacoes text,
  valor_centavos integer not null default 0,
  criado_em timestamptz not null default now()
);
