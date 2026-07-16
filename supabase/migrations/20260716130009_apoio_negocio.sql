-- Migration 0009 — Apoio ao negócio (Spec 02 §5.6)

create table lista_espera (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid references salas(id),                      -- null = qualquer sala
  data date not null,
  associado_id uuid references associados(id),
  nome text not null,
  contato text not null,
  observacoes text,
  convertido_locacao_id uuid references locacoes(id),
  criado_em timestamptz not null default now()            -- ordem de chegada
);
create index lista_espera_fila_idx on lista_espera (data, criado_em) where convertido_locacao_id is null;

create table periodos_gratuitos (
  id uuid primary key default gen_random_uuid(),
  associado_id uuid not null references associados(id),
  locacao_id uuid not null unique references locacoes(id) on delete cascade,
  ciclo date not null,                                    -- 1º dia do mês de competência
  horas numeric not null check (horas > 0),
  criado_em timestamptz not null default now()
);
create index periodos_gratuitos_ciclo_idx on periodos_gratuitos (associado_id, ciclo);

create table comissoes (
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null references locacoes(id),
  origem origem_comissao not null,
  valor_centavos integer not null check (valor_centavos >= 0),
  competencia date not null,                              -- 1º dia do mês
  exportada boolean not null default false,
  criado_em timestamptz not null default now()
);

create table campos_formulario (
  id uuid primary key default gen_random_uuid(),
  rotulo text not null,
  tipo tipo_campo not null,
  opcoes jsonb not null default '[]',                     -- para selecao/multiselecao
  obrigatorio boolean not null default false,
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table configuracoes (
  chave text primary key,                                 -- 'desconto_multi_sala', 'periodo_gratuito', 'comissao'…
  valor jsonb not null,
  descricao text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);

create trigger configuracoes_set_atualizado_em
  before update on configuracoes
  for each row execute function set_atualizado_em();
