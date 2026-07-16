-- Migration 0008 — Contratos e pagamentos (Spec 02 §5.5)

create table contratos (
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null references locacoes(id) on delete cascade,
  autentique_id text unique,
  status status_contrato not null default 'pendente',
  link_assinatura text,
  pdf_url text,                                           -- Storage: bucket 'contratos' (privado)
  enviado_em timestamptz,
  assinado_em timestamptz,
  criado_em timestamptz not null default now()
);

create table pagamentos (
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null references locacoes(id) on delete cascade,
  descricao text not null,                                -- "Locação", "Coffee" (híbridos: N por locação)
  forma forma_pagamento not null,
  valor_centavos integer not null check (valor_centavos >= 0),
  status status_pagamento not null default 'pendente',
  comprovante_url text,                                   -- Storage: bucket 'comprovantes' (privado)
  baixa_por uuid references auth.users(id),               -- baixa manual (v1)
  baixa_em timestamptz,
  criado_em timestamptz not null default now()
);
