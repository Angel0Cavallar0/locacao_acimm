-- Spec 20 §5 — Período gratuito do sócio: regra POR SALA (gerida pelo
-- colaborador) + consumo por (associado, sala, ciclo) na MESMA transação da
-- criação da locação, com lock para resolver a corrida do último uso.

-- Regra por sala (uma por sala). Escrita via service role (sem policy de write).
create table regras_periodo_gratuito (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid not null unique references salas(id),
  periodos periodo_dia[] not null check (array_length(periodos, 1) > 0),
  usos_por_ciclo integer not null default 1 check (usos_por_ciclo > 0),
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);

alter table regras_periodo_gratuito enable row level security;
-- Colaborador lê tudo; qualquer autenticado lê as ativas (o portal precisa da
-- elegibilidade). Escrita: service role.
create policy regras_pg_select on regras_periodo_gratuito for select to authenticated
  using (ativo or eh_colaborador());

create trigger regras_pg_atualizado_em
  before update on regras_periodo_gratuito
  for each row execute function set_atualizado_em();

-- Consumo passa a ser contado POR SALA.
alter table periodos_gratuitos add column sala_id uuid references salas(id);
create index periodos_gratuitos_sala_ciclo_idx
  on periodos_gratuitos (associado_id, sala_id, ciclo);

-- Disponibilidade de um uso, sob lock por (associado, sala, ciclo). O lock é do
-- xact: segura até o fim da criação, serializando reservas concorrentes do mesmo
-- benefício → só uma consome; a outra recebe o sentinel e recalcula.
create or replace function periodo_gratuito_disponivel(
  p_associado_id uuid,
  p_sala_id uuid,
  p_ciclo date
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limite int;
  v_ativo boolean;
  v_uso int;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      p_associado_id::text || ':' || p_sala_id::text || ':' || p_ciclo::text, 0
    )
  );
  select usos_por_ciclo, ativo into v_limite, v_ativo
    from regras_periodo_gratuito where sala_id = p_sala_id;
  if v_limite is null or v_ativo is not true then
    return false;
  end if;
  select count(*) into v_uso from periodos_gratuitos
    where associado_id = p_associado_id and sala_id = p_sala_id and ciclo = p_ciclo;
  return v_uso < v_limite;
end $$;

revoke execute on function periodo_gratuito_disponivel(uuid, uuid, date)
  from public, anon, authenticated;
grant execute on function periodo_gratuito_disponivel(uuid, uuid, date) to service_role;

-- ---------------------------------------------------------------------------
-- Recria as duas RPCs de criação com desconto/flag + consumo do benefício.
-- Retorno vira TEXT (id da locação OU sentinel 'beneficio_indisponivel').
-- ---------------------------------------------------------------------------

drop function if exists criar_solicitacao_portal(
  uuid, text, text, text, text, text, timestamptz, timestamptz, periodo_dia,
  integer, text, text, jsonb, forma_pagamento, integer, integer, integer,
  jsonb, jsonb, uuid
);

create function criar_solicitacao_portal(
  p_associado_id uuid,
  p_nome text,
  p_documento text,
  p_email text,
  p_telefone text,
  p_responsavel_nome text,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_periodo periodo_dia,
  p_qtd_pessoas int,
  p_tipo_evento text,
  p_observacoes text,
  p_respostas jsonb,
  p_forma forma_pagamento,
  p_valor_salas int,
  p_valor_coffee int,
  p_valor_total int,
  p_salas jsonb,
  p_coffee jsonb,
  p_autor uuid,
  p_valor_descontos int default 0,
  p_periodo_gratuito_aplicado boolean default false,
  p_periodo_gratuito jsonb default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
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
    0, p_valor_descontos, p_valor_total, p_periodo_gratuito_aplicado, p_autor
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
$$;

revoke execute on function criar_solicitacao_portal(
  uuid, text, text, text, text, text, timestamptz, timestamptz, periodo_dia,
  integer, text, text, jsonb, forma_pagamento, integer, integer, integer,
  jsonb, jsonb, uuid, integer, boolean, jsonb
) from public, anon, authenticated;
grant execute on function criar_solicitacao_portal(
  uuid, text, text, text, text, text, timestamptz, timestamptz, periodo_dia,
  integer, text, text, jsonb, forma_pagamento, integer, integer, integer,
  jsonb, jsonb, uuid, integer, boolean, jsonb
) to service_role;

drop function if exists criar_locacao_assistida(
  condicao_locatario, uuid, text, text, text, text, text, timestamptz, timestamptz,
  periodo_dia, integer, text, text, jsonb, forma_pagamento, integer, integer,
  integer, integer, jsonb, jsonb, jsonb, uuid, uuid
);

create function criar_locacao_assistida(
  p_condicao condicao_locatario,
  p_associado_id uuid,
  p_nome text,
  p_documento text,
  p_email text,
  p_telefone text,
  p_responsavel_nome text,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_periodo periodo_dia,
  p_qtd_pessoas int,
  p_tipo_evento text,
  p_observacoes text,
  p_respostas jsonb,
  p_forma forma_pagamento,
  p_valor_salas int,
  p_valor_coffee int,
  p_valor_adicionais int,
  p_valor_total int,
  p_salas jsonb,
  p_coffee jsonb,
  p_adicionais jsonb,
  p_autor uuid,
  p_fila_espera_id uuid default null,
  p_valor_descontos int default 0,
  p_periodo_gratuito_aplicado boolean default false,
  p_periodo_gratuito jsonb default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
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

  insert into locacao_adicionais (locacao_id, descricao, quantidade, valor_unitario_centavos)
  select v_id, e->>'descricao', (e->>'quantidade')::numeric, (e->>'valor_unitario')::int
  from jsonb_array_elements(coalesce(p_adicionais, '[]'::jsonb)) e;

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
$$;

revoke execute on function criar_locacao_assistida(
  condicao_locatario, uuid, text, text, text, text, text, timestamptz, timestamptz,
  periodo_dia, integer, text, text, jsonb, forma_pagamento, integer, integer,
  integer, integer, jsonb, jsonb, jsonb, uuid, uuid, integer, boolean, jsonb
) from public, anon, authenticated;
grant execute on function criar_locacao_assistida(
  condicao_locatario, uuid, text, text, text, text, text, timestamptz, timestamptz,
  periodo_dia, integer, text, text, jsonb, forma_pagamento, integer, integer,
  integer, integer, jsonb, jsonb, jsonb, uuid, uuid, integer, boolean, jsonb
) to service_role;
