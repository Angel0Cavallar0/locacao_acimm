-- Migration 0006 — Agenda e conflitos (Spec 02 §5.3)
-- Coração da disponibilidade: uma única tabela de ocupações mantida por
-- trigger, carregando a constraint de exclusão como última linha de defesa.

create table eventos_internos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  sala_id uuid not null references salas(id),
  inicio timestamptz not null,
  fim timestamptz not null,
  check (fim > inicio),
  prioridade prioridade_evento not null default 'media',  -- alta = não remaneja
  sympla_event_id text,
  qtd_inscritos integer,
  sincronizado_em timestamptz,
  google_event_id text,
  cancelado boolean not null default false,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create trigger eventos_internos_set_atualizado_em
  before update on eventos_internos
  for each row execute function set_atualizado_em();

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

-- ---------------------------------------------------------------------------
-- Sincronização por triggers (security definer — escrevem numa tabela sem
-- policy de escrita para authenticated).
-- ---------------------------------------------------------------------------

-- Refaz as linhas de agenda de UMA locação a partir do seu estado atual.
-- bloqueante quando status ∈ (aprovada … realizada); rascunho/recusada/
-- cancelada/finalizada não ocupam a agenda.
create or replace function rebuild_agenda_locacao(p_locacao_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_loc locacoes;
begin
  delete from agenda_ocupacoes where locacao_id = p_locacao_id;

  select * into v_loc from locacoes where id = p_locacao_id;
  if not found then
    return;
  end if;
  if v_loc.status in ('rascunho','recusada','cancelada','finalizada') then
    return;
  end if;

  insert into agenda_ocupacoes (sala_id, periodo, origem, locacao_id, bloqueante)
  select
    ls.sala_id,
    tstzrange(v_loc.inicio, v_loc.fim, '[)'),
    'locacao',
    v_loc.id,
    v_loc.status in ('aprovada','contrato_enviado','contrato_assinado',
                     'aguardando_pagamento','confirmada','realizada')
  from locacao_salas ls
  where ls.locacao_id = v_loc.id;
end;
$$;

create or replace function tg_locacoes_agenda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform rebuild_agenda_locacao(new.id);
  return null;
end;
$$;

create trigger locacoes_agenda_sync
  after insert or update of status, inicio, fim on locacoes
  for each row execute function tg_locacoes_agenda();

create or replace function tg_locacao_salas_agenda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform rebuild_agenda_locacao(coalesce(new.locacao_id, old.locacao_id));
  return null;
end;
$$;

create trigger locacao_salas_agenda_sync
  after insert or update or delete on locacao_salas
  for each row execute function tg_locacao_salas_agenda();

-- Evento interno mantém a própria linha (sempre bloqueante, salvo cancelado).
create or replace function tg_eventos_agenda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from agenda_ocupacoes where evento_interno_id = new.id;
  insert into agenda_ocupacoes (sala_id, periodo, origem, evento_interno_id, bloqueante)
  values (new.sala_id, tstzrange(new.inicio, new.fim, '[)'), 'evento_interno', new.id, not new.cancelado);
  return null;
end;
$$;

create trigger eventos_internos_agenda_sync
  after insert or update of sala_id, inicio, fim, cancelado on eventos_internos
  for each row execute function tg_eventos_agenda();
