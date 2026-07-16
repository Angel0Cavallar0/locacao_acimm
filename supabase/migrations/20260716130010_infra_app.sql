-- Migration 0010 — Infra da aplicação (Spec 02 §5.7)

create table google_conexoes (                            -- linha única: conta Google da ACIMM
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  conta_email text not null,
  calendario_id text not null default 'primary',
  refresh_token_cifrado text not null,                    -- AES-GCM com TOKEN_ENCRYPTION_KEY (cifrado na aplicação)
  status text not null default 'ativa',
  conectado_por uuid references auth.users(id),
  atualizado_em timestamptz not null default now()
);

create trigger google_conexoes_set_atualizado_em
  before update on google_conexoes
  for each row execute function set_atualizado_em();

create table notificacoes (                               -- log + fila com retry
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
