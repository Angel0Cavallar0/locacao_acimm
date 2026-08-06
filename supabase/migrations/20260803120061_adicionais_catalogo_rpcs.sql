-- Migration 0061 — Adicionais do catálogo nas RPCs de criação (Ciclo 2 / Spec 30)
-- Estende o insert de `p_adicionais` para gravar `servico_adicional_id` e derivar
-- as flags de checklist (aprovacao/disponibilidade) do catálogo. O portal passa a
-- receber adicionais (novos params). Corpos reproduzidos das definições atuais
-- (pg_get_functiondef), mudando apenas o necessário.

-- ---------------------------------------------------------------------------
-- Assistida: assinatura inalterada → CREATE OR REPLACE (preserva grants).
-- ---------------------------------------------------------------------------
create or replace function public.criar_locacao_assistida(
  p_condicao condicao_locatario, p_associado_id uuid, p_nome text, p_documento text,
  p_email text, p_telefone text, p_responsavel_nome text,
  p_inicio timestamp with time zone, p_fim timestamp with time zone,
  p_periodo periodo_dia, p_qtd_pessoas integer, p_tipo_evento text, p_observacoes text,
  p_respostas jsonb, p_forma forma_pagamento, p_valor_salas integer,
  p_valor_coffee integer, p_valor_adicionais integer, p_valor_total integer,
  p_salas jsonb, p_coffee jsonb, p_adicionais jsonb, p_autor uuid,
  p_fila_espera_id uuid default null::uuid, p_valor_descontos integer default 0,
  p_periodo_gratuito_aplicado boolean default false,
  p_periodo_gratuito jsonb default null::jsonb)
returns text
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_id uuid;
  v_da_fila boolean := false;
  v_pg_sala uuid;
  v_pg_ciclo date;
begin
  if p_periodo_gratuito is not null then
    v_pg_sala := (p_periodo_gratuito->>'sala_id')::uuid;
    v_pg_ciclo := (p_periodo_gratuito->>'ciclo')::date;
    if not periodo_gratuito_disponivel(p_associado_id, v_pg_sala, v_pg_ciclo) then
      return 'beneficio_indisponivel';
    end if;
  end if;

  insert into locacoes (
    condicao, associado_id, locatario_nome, locatario_documento,
    locatario_email, locatario_telefone, responsavel_nome, inicio, fim,
    periodo, qtd_pessoas, tipo_evento, observacoes, respostas_formulario,
    forma_pagamento_preferida, status, valor_salas_centavos,
    valor_coffee_centavos, valor_adicionais_centavos, valor_descontos_centavos,
    valor_total_centavos, periodo_gratuito_aplicado, criado_por
  ) values (
    p_condicao, p_associado_id, p_nome, p_documento,
    p_email, p_telefone, nullif(btrim(coalesce(p_responsavel_nome,'')), ''),
    p_inicio, p_fim, p_periodo, p_qtd_pessoas,
    nullif(btrim(coalesce(p_tipo_evento,'')), ''),
    nullif(btrim(coalesce(p_observacoes,'')), ''),
    coalesce(p_respostas, '{}'::jsonb), p_forma,
    'solicitada', p_valor_salas, p_valor_coffee,
    p_valor_adicionais, p_valor_descontos, p_valor_total,
    p_periodo_gratuito_aplicado, p_autor
  ) returning id into v_id;

  insert into locacao_salas (locacao_id, sala_id, valor_centavos)
  select v_id, (e->>'sala_id')::uuid, (e->>'valor')::int
  from jsonb_array_elements(p_salas) e;

  if p_coffee is not null then
    insert into coffee_breaks (
      locacao_id, nivel_id, qtd_pessoas, horario_servir,
      adicionais, observacoes, valor_centavos
    ) values (
      v_id,
      (p_coffee->>'nivel_id')::uuid,
      (p_coffee->>'qtd_pessoas')::int,
      case when p_coffee->>'horario_servir' is not null
           then (p_coffee->>'horario_servir')::timestamptz else null end,
      coalesce(p_coffee->'adicionais', '[]'::jsonb),
      nullif(btrim(coalesce(p_coffee->>'observacoes','')), ''),
      (p_coffee->>'valor')::int
    );
  end if;

  -- Ciclo 2: vincula ao catálogo e deriva as flags de checklist.
  insert into locacao_adicionais (
    locacao_id, servico_adicional_id, descricao, quantidade,
    valor_unitario_centavos, aprovacao_status, disponibilidade_status
  )
  select
    v_id,
    nullif(e->>'servico_adicional_id','')::uuid,
    e->>'descricao',
    (e->>'quantidade')::numeric,
    (e->>'valor_unitario')::int,
    case when sa.requer_aprovacao then 'pendente' end,
    case when sa.sujeito_disponibilidade then 'pendente' end
  from jsonb_array_elements(coalesce(p_adicionais, '[]'::jsonb)) e
  left join servicos_adicionais sa
    on sa.id = nullif(e->>'servico_adicional_id','')::uuid;

  if p_fila_espera_id is not null then
    update lista_espera
      set convertido_locacao_id = v_id
      where id = p_fila_espera_id
        and convertido_locacao_id is null
        and arquivado_em is null;
    v_da_fila := found;
  end if;

  if p_periodo_gratuito is not null then
    insert into periodos_gratuitos (associado_id, sala_id, locacao_id, ciclo, horas)
    values (
      p_associado_id, v_pg_sala, v_id, v_pg_ciclo,
      greatest((p_periodo_gratuito->>'horas')::numeric, 0.5)
    );
  end if;

  insert into locacao_eventos (locacao_id, de, para, autor_user_id, observacao)
  values (
    v_id, null, 'solicitada', p_autor,
    case when v_da_fila
         then 'Criada via atendimento assistido · Originada da lista de espera'
         else 'Criada via atendimento assistido' end
  );

  return v_id::text;
end;
$fn$;

-- ---------------------------------------------------------------------------
-- Portal: assinatura muda (novos params) → DROP + CREATE + refazer grants.
-- ---------------------------------------------------------------------------
drop function if exists public.criar_solicitacao_portal(
  uuid, text, text, text, text, text, timestamp with time zone,
  timestamp with time zone, periodo_dia, integer, text, text, jsonb,
  forma_pagamento, integer, integer, integer, jsonb, jsonb, uuid, integer,
  boolean, jsonb);

create function public.criar_solicitacao_portal(
  p_associado_id uuid, p_nome text, p_documento text, p_email text, p_telefone text,
  p_responsavel_nome text, p_inicio timestamp with time zone,
  p_fim timestamp with time zone, p_periodo periodo_dia, p_qtd_pessoas integer,
  p_tipo_evento text, p_observacoes text, p_respostas jsonb, p_forma forma_pagamento,
  p_valor_salas integer, p_valor_coffee integer, p_valor_total integer,
  p_salas jsonb, p_coffee jsonb, p_autor uuid, p_valor_descontos integer default 0,
  p_periodo_gratuito_aplicado boolean default false,
  p_periodo_gratuito jsonb default null::jsonb,
  p_adicionais jsonb default '[]'::jsonb, p_valor_adicionais integer default 0)
returns text
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_id uuid;
  v_pg_sala uuid;
  v_pg_ciclo date;
begin
  if p_periodo_gratuito is not null then
    v_pg_sala := (p_periodo_gratuito->>'sala_id')::uuid;
    v_pg_ciclo := (p_periodo_gratuito->>'ciclo')::date;
    if not periodo_gratuito_disponivel(p_associado_id, v_pg_sala, v_pg_ciclo) then
      return 'beneficio_indisponivel';
    end if;
  end if;

  insert into locacoes (
    condicao, associado_id, locatario_nome, locatario_documento,
    locatario_email, locatario_telefone, responsavel_nome, inicio, fim,
    periodo, qtd_pessoas, tipo_evento, observacoes, respostas_formulario,
    forma_pagamento_preferida, status, valor_salas_centavos,
    valor_coffee_centavos, valor_adicionais_centavos, valor_descontos_centavos,
    valor_total_centavos, periodo_gratuito_aplicado, criado_por
  ) values (
    'associado', p_associado_id, p_nome, p_documento,
    p_email, p_telefone, nullif(btrim(coalesce(p_responsavel_nome,'')), ''),
    p_inicio, p_fim, p_periodo, p_qtd_pessoas,
    nullif(btrim(coalesce(p_tipo_evento,'')), ''),
    nullif(btrim(coalesce(p_observacoes,'')), ''),
    coalesce(p_respostas, '{}'::jsonb), p_forma,
    'solicitada', p_valor_salas, p_valor_coffee,
    p_valor_adicionais, p_valor_descontos, p_valor_total,
    p_periodo_gratuito_aplicado, p_autor
  ) returning id into v_id;

  insert into locacao_salas (locacao_id, sala_id, valor_centavos)
  select v_id, (e->>'sala_id')::uuid, (e->>'valor')::int
  from jsonb_array_elements(p_salas) e;

  if p_coffee is not null then
    insert into coffee_breaks (
      locacao_id, nivel_id, qtd_pessoas, horario_servir,
      adicionais, observacoes, valor_centavos
    ) values (
      v_id,
      (p_coffee->>'nivel_id')::uuid,
      (p_coffee->>'qtd_pessoas')::int,
      case when p_coffee->>'horario_servir' is not null
           then (p_coffee->>'horario_servir')::timestamptz else null end,
      coalesce(p_coffee->'adicionais', '[]'::jsonb),
      nullif(btrim(coalesce(p_coffee->>'observacoes','')), ''),
      (p_coffee->>'valor')::int
    );
  end if;

  -- Ciclo 2: adicionais do catálogo (valores já recalculados no servidor).
  insert into locacao_adicionais (
    locacao_id, servico_adicional_id, descricao, quantidade,
    valor_unitario_centavos, aprovacao_status, disponibilidade_status
  )
  select
    v_id,
    nullif(e->>'servico_adicional_id','')::uuid,
    e->>'descricao',
    (e->>'quantidade')::numeric,
    (e->>'valor_unitario')::int,
    case when sa.requer_aprovacao then 'pendente' end,
    case when sa.sujeito_disponibilidade then 'pendente' end
  from jsonb_array_elements(coalesce(p_adicionais, '[]'::jsonb)) e
  left join servicos_adicionais sa
    on sa.id = nullif(e->>'servico_adicional_id','')::uuid;

  if p_periodo_gratuito is not null then
    insert into periodos_gratuitos (associado_id, sala_id, locacao_id, ciclo, horas)
    values (
      p_associado_id, v_pg_sala, v_id, v_pg_ciclo,
      greatest((p_periodo_gratuito->>'horas')::numeric, 0.5)
    );
  end if;

  insert into locacao_eventos (locacao_id, de, para, autor_user_id, observacao)
  values (v_id, null, 'solicitada', p_autor, 'Criada pelo associado via portal');

  return v_id::text;
end;
$fn$;

revoke all on function public.criar_solicitacao_portal(
  uuid, text, text, text, text, text, timestamp with time zone,
  timestamp with time zone, periodo_dia, integer, text, text, jsonb,
  forma_pagamento, integer, integer, integer, jsonb, jsonb, uuid, integer,
  boolean, jsonb, jsonb, integer) from public, anon, authenticated;
grant execute on function public.criar_solicitacao_portal(
  uuid, text, text, text, text, text, timestamp with time zone,
  timestamp with time zone, periodo_dia, integer, text, text, jsonb,
  forma_pagamento, integer, integer, integer, jsonb, jsonb, uuid, integer,
  boolean, jsonb, jsonb, integer) to service_role;
