-- Spec 17 — Eventos ACIMM + Sympla. Guarda o link público do evento Sympla,
-- expõe-o na view de disponibilidade (o portal mostra "participar do evento") e
-- agenda o sync horário de inscritos (padrão de cron do Spec 16).

alter table eventos_internos add column if not exists sympla_url text;

-- View de disponibilidade recriada expondo a URL do Sympla. Mantém
-- security_invoker = false (definer — intencional, Spec 02 §6): roda como owner
-- para o associado ver disponibilidade sem policy de select em agenda_ocupacoes.
create or replace view disponibilidade with (security_invoker = false) as
  select o.sala_id,
         o.periodo,
         case
           when o.origem = 'evento_interno'::origem_ocupacao then 'evento_acimm'::text
           when o.bloqueante then 'ocupado'::text
           else 'solicitado'::text
         end as situacao,
         e.titulo as evento_titulo,
         e.sympla_event_id as evento_sympla_id,
         e.sympla_url as evento_sympla_url
  from agenda_ocupacoes o
  left join eventos_internos e on e.id = o.evento_interno_id;

-- RPC do portal passa a devolver a URL. Adicionar coluna ao RETURNS TABLE muda
-- o tipo de retorno → drop + create (create or replace não permite). Refaz os
-- grants: EXECUTE só para service_role (padrão do projeto).
drop function if exists disponibilidade_no_dia(timestamptz, timestamptz, uuid[]);
create function disponibilidade_no_dia(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_sala_ids uuid[]
)
returns table (
  sala_id uuid,
  inicio timestamptz,
  fim timestamptz,
  situacao text,
  evento_titulo text,
  evento_sympla_id text,
  evento_sympla_url text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.sala_id, lower(d.periodo), upper(d.periodo),
         d.situacao, d.evento_titulo, d.evento_sympla_id, d.evento_sympla_url
  from disponibilidade d
  where d.sala_id = any(p_sala_ids)
    and d.periodo && tstzrange(p_inicio, p_fim, '[)');
$$;

revoke execute on function disponibilidade_no_dia(timestamptz, timestamptz, uuid[])
  from public, anon, authenticated;
grant execute on function disponibilidade_no_dia(timestamptz, timestamptz, uuid[])
  to service_role;

-- Job de sync de inscritos (a cada hora). Reaplicar não duplica (upsert por nome).
select cron.schedule('sympla-inscritos', '0 * * * *', $$select chamar_cron('sympla-inscritos')$$);
