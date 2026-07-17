-- Migration 0017 — Catálogo global de equipamentos (tags reutilizáveis)
-- As tags criadas numa sala ficam disponíveis para todas. Escrita via service
-- role (server action); leitura por colaborador.

create table equipamentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_em timestamptz not null default now()
);

alter table equipamentos enable row level security;

create policy equipamentos_colaborador_select on equipamentos for select to authenticated
  using (eh_colaborador());
