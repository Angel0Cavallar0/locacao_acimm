-- Migration 0018 — Horas adicionais por sala (Spec 04, extensão)
-- Config por sala: a partir de quantos minutos além do período a hora extra é
-- cobrada, e a matriz de valores condição × categoria de horário.

alter table salas add column if not exists hora_adicional_minutos integer
  check (hora_adicional_minutos is null or hora_adicional_minutos >= 0);

create type categoria_hora_adicional as enum ('comercial', 'noturno', 'sabado_domingo');

create table precos_hora_adicional (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid not null references salas(id) on delete cascade,
  condicao condicao_locatario not null,
  categoria categoria_hora_adicional not null,
  valor_centavos integer not null check (valor_centavos >= 0),
  criado_em timestamptz not null default now(),
  unique (sala_id, condicao, categoria)
);

alter table precos_hora_adicional enable row level security;
create policy precos_hora_adicional_colaborador_select on precos_hora_adicional
  for select to authenticated using (eh_colaborador());
