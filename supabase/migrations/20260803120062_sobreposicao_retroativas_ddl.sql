-- Migration 0062 — Sobreposição de eventos + locações retroativas (Spec 31 · Ciclo 2 Fase 3)
-- Parte 1/2: DDL puro (colunas, rebuild/trigger da agenda, constraint parcial,
-- agenda_no_intervalo). As RPCs de escrita ficam na 0063.
--
-- Ponto crítico: uma linha `sobreposicao_autorizada = true` sai INTEIRA do índice
-- GiST parcial — o banco deixa de barrar o par que a envolve. Os defaults `false`
-- preservam bit a bit o comportamento atual; a proteção comum × comum permanece.

-- (1) Flags na locação (quem/quando autorizou) e na ocupação (espelho da agenda).
alter table locacoes
  add column sobreposicao_autorizada boolean not null default false,
  add column sobreposicao_autorizada_por uuid references auth.users(id),
  add column sobreposicao_autorizada_em timestamptz,
  add column retroativa boolean not null default false;

alter table agenda_ocupacoes
  add column sobreposicao_autorizada boolean not null default false;

-- (2) rebuild_agenda_locacao passa a espelhar a flag da locação na ocupação.
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

  insert into agenda_ocupacoes (
    sala_id, periodo, origem, locacao_id, bloqueante, sobreposicao_autorizada
  )
  select
    ls.sala_id,
    tstzrange(v_loc.inicio, v_loc.fim, '[)'),
    'locacao',
    v_loc.id,
    v_loc.status in ('aprovada','contrato_enviado','contrato_assinado',
                     'aguardando_pagamento','confirmada','realizada'),
    coalesce(v_loc.sobreposicao_autorizada, false)
  from locacao_salas ls
  where ls.locacao_id = v_loc.id;
end;
$$;

-- (3) O trigger reage também a mudanças na flag (autorizar/desautorizar precisa
--     re-espelhar na agenda para a linha sair/voltar ao índice parcial).
drop trigger locacoes_agenda_sync on locacoes;
create trigger locacoes_agenda_sync
  after insert or update of status, inicio, fim, sobreposicao_autorizada on locacoes
  for each row execute function tg_locacoes_agenda();

-- (4) Constraint de exclusão vira PARCIAL: linha autorizada sai do índice.
--     Mesmo nome (referenciado por `set constraints ... deferred`) e mesmo
--     `deferrable initially immediate` (mig 0026).
alter table agenda_ocupacoes drop constraint agenda_sem_sobreposicao;
alter table agenda_ocupacoes
  add constraint agenda_sem_sobreposicao
  exclude using gist (sala_id with =, periodo with &&)
    where (bloqueante and not sobreposicao_autorizada)
  deferrable initially immediate;

-- (5) agenda_no_intervalo devolve a flag (o app diferencia sobreposição
--     autorizada). Mudar RETURNS TABLE exige drop + create + re-grant.
drop function if exists agenda_no_intervalo(timestamptz, timestamptz);
create function agenda_no_intervalo(p_inicio timestamptz, p_fim timestamptz)
returns table (
  id uuid,
  sala_id uuid,
  sala_nome text,
  inicio timestamptz,
  fim timestamptz,
  origem origem_ocupacao,
  bloqueante boolean,
  motivo text,
  responsavel_id uuid,
  locacao_id uuid,
  locacao_numero bigint,
  locatario text,
  status status_locacao,
  qtd_pessoas integer,
  valor_total_centavos integer,
  evento_id uuid,
  evento_titulo text,
  prioridade prioridade_evento,
  qtd_inscritos integer,
  sympla_event_id text,
  sobreposicao_autorizada boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.sala_id,
    s.nome,
    lower(o.periodo),
    upper(o.periodo),
    o.origem,
    o.bloqueante,
    o.motivo,
    coalesce(o.criado_por, l.criado_por, e.criado_por),
    l.id,
    l.numero,
    l.locatario_nome,
    l.status,
    l.qtd_pessoas,
    l.valor_total_centavos,
    e.id,
    e.titulo,
    e.prioridade,
    e.qtd_inscritos,
    e.sympla_event_id,
    o.sobreposicao_autorizada
  from agenda_ocupacoes o
  join salas s on s.id = o.sala_id
  left join locacoes l on l.id = o.locacao_id
  left join eventos_internos e on e.id = o.evento_interno_id
  where o.periodo && tstzrange(p_inicio, p_fim, '[)')
  order by lower(o.periodo);
$$;

revoke execute on function agenda_no_intervalo(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function agenda_no_intervalo(timestamptz, timestamptz) to service_role;
