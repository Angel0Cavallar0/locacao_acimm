-- Migration 0064 — Dashboard/UI refinamentos (Spec 32 · Ciclo 2 Fase 4)
-- (1) Observações internas na locação; (2) busca de associado por código Sophus;
-- (3) horário do coffee na consulta consolidada da agenda.

-- (1) §3.4 — anotações internas da equipe (nunca expostas ao portal).
alter table locacoes add column observacoes_internas text;

-- (2) §3.1 — buscar_associados passa a casar/retornar codigo_sophus (a coluna já
-- existe no espelho Sophus). Muda RETURNS TABLE → drop + create + re-grant.
drop function if exists buscar_associados(text, integer);
create function buscar_associados(p_termo text, p_limite integer default 10)
returns table (
  id uuid,
  nome text,
  razao_social text,
  documento text,
  tipo_documento tipo_documento,
  emails text[],
  telefone text,
  celular text,
  whatsapp text,
  situacao situacao_associado,
  codigo_sophus integer
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.nome, a.razao_social, a.documento, a.tipo_documento,
         a.emails, a.telefone, a.celular, a.whatsapp, a.situacao, a.codigo_sophus
  from associados a
  where
    to_tsvector('portuguese', imm_unaccent(coalesce(a.nome,'') || ' ' || coalesce(a.razao_social,'')))
      @@ plainto_tsquery('portuguese', imm_unaccent(coalesce(p_termo,'')))
    or (
      length(regexp_replace(coalesce(p_termo,''), '\D', '', 'g')) >= 3
      and a.documento like regexp_replace(p_termo, '\D', '', 'g') || '%'
    )
    or (
      length(regexp_replace(coalesce(p_termo,''), '\D', '', 'g')) >= 1
      and a.codigo_sophus is not null
      and a.codigo_sophus::text like regexp_replace(p_termo, '\D', '', 'g') || '%'
    )
  order by (a.situacao = 'ativo') desc, a.nome
  limit least(coalesce(p_limite, 10), 25);
$$;

revoke execute on function buscar_associados(text, integer) from public, anon, authenticated;
grant execute on function buscar_associados(text, integer) to service_role;

-- (3) §2.1 — agenda_no_intervalo devolve o horário de servir do coffee da locação.
-- Muda RETURNS TABLE → drop + create + re-grant. Corpo = versão da 0062 + join.
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
  sobreposicao_autorizada boolean,
  coffee_horario_servir timestamptz
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
    o.sobreposicao_autorizada,
    cb.horario_servir
  from agenda_ocupacoes o
  join salas s on s.id = o.sala_id
  left join locacoes l on l.id = o.locacao_id
  left join eventos_internos e on e.id = o.evento_interno_id
  left join coffee_breaks cb on cb.locacao_id = o.locacao_id
  where o.periodo && tstzrange(p_inicio, p_fim, '[)')
  order by lower(o.periodo);
$$;

revoke execute on function agenda_no_intervalo(timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function agenda_no_intervalo(timestamptz, timestamptz) to service_role;
