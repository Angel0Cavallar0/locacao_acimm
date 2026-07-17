-- Migration 0024 — Consulta consolidada da agenda (Spec 05 §3)
-- RPC que devolve as ocupações que se sobrepõem a um intervalo, já com os
-- dados da origem resolvidos (locação / evento interno / bloqueio). Evita a
-- codificação frágil de literais de range no PostgREST.
--
-- Chamada SEMPRE via service role em server action após requireColaborador();
-- por isso EXECUTE é revogado de anon/authenticated (associado consulta apenas
-- a view `disponibilidade`, nunca esta função).

create or replace function agenda_no_intervalo(p_inicio timestamptz, p_fim timestamptz)
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
  sympla_event_id text
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
    e.sympla_event_id
  from agenda_ocupacoes o
  join salas s on s.id = o.sala_id
  left join locacoes l on l.id = o.locacao_id
  left join eventos_internos e on e.id = o.evento_interno_id
  where o.periodo && tstzrange(p_inicio, p_fim, '[)')
  order by lower(o.periodo);
$$;

revoke execute on function agenda_no_intervalo(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function agenda_no_intervalo(timestamptz, timestamptz) to service_role;
