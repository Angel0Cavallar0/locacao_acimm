-- Migration 0063 — Sobreposição + retroativas (Spec 31 · Ciclo 2 Fase 3)
-- Parte 2/2: RPCs de escrita ganham advisory lock por sala + checagem explícita
-- de conflito. Com a constraint parcial (0062), a linha autorizada sai do índice
-- e o banco não barra mais o par que a envolve — a autoridade de conflito passa a
-- ser o servidor. O lock (padrão de periodo_gratuito_disponivel, mig 0048) fecha o
-- TOCTOU que o banco não cobre mais.
--
-- Chave de lock uniforme entre TODAS as RPCs: hashtextextended('agenda:'||sala::text, 0).

-- ---------------------------------------------------------------------------
-- (1) criar_locacao_assistida: +p_sobreposicao_autorizada, +p_retroativa.
--     Conflito bloqueante sem autorização → 'conflito_agenda' (o app abre o
--     pop-up). Autorizado → grava flag + quem/quando.
-- ---------------------------------------------------------------------------
drop function if exists criar_locacao_assistida(
  condicao_locatario, uuid, text, text, text, text, text, timestamptz, timestamptz,
  periodo_dia, integer, text, text, jsonb, forma_pagamento, integer, integer,
  integer, integer, jsonb, jsonb, jsonb, uuid, uuid, integer, boolean, jsonb
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
  p_qtd_pessoas integer,
  p_tipo_evento text,
  p_observacoes text,
  p_respostas jsonb,
  p_forma forma_pagamento,
  p_valor_salas integer,
  p_valor_coffee integer,
  p_valor_adicionais integer,
  p_valor_total integer,
  p_salas jsonb,
  p_coffee jsonb,
  p_adicionais jsonb,
  p_autor uuid,
  p_fila_espera_id uuid default null,
  p_valor_descontos integer default 0,
  p_periodo_gratuito_aplicado boolean default false,
  p_periodo_gratuito jsonb default null,
  p_sobreposicao_autorizada boolean default false,
  p_retroativa boolean default false
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
  -- Trava as salas (ordem estável) antes de checar/gravar — fecha o TOCTOU.
  perform pg_advisory_xact_lock(hashtextextended('agenda:' || sid, 0))
  from (
    select distinct e->>'sala_id' as sid
    from jsonb_array_elements(p_salas) e
    order by 1
  ) s;

  -- Conflito com ocupante bloqueante (inclui outra locação já autorizada).
  -- Sem autorização explícita → devolve para o app abrir o pop-up.
  if not p_sobreposicao_autorizada and exists (
    select 1
    from jsonb_array_elements(p_salas) e
    join agenda_ocupacoes o on o.sala_id = (e->>'sala_id')::uuid
    where o.bloqueante
      and o.periodo && tstzrange(p_inicio, p_fim, '[)')
  ) then
    return 'conflito_agenda';
  end if;

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
    valor_total_centavos, periodo_gratuito_aplicado, criado_por,
    sobreposicao_autorizada, sobreposicao_autorizada_por, sobreposicao_autorizada_em,
    retroativa
  ) values (
    p_condicao, p_associado_id, p_nome, p_documento,
    p_email, p_telefone, nullif(btrim(coalesce(p_responsavel_nome,'')), ''),
    p_inicio, p_fim, p_periodo, p_qtd_pessoas,
    nullif(btrim(coalesce(p_tipo_evento,'')), ''),
    nullif(btrim(coalesce(p_observacoes,'')), ''),
    coalesce(p_respostas, '{}'::jsonb), p_forma,
    'solicitada', p_valor_salas, p_valor_coffee,
    p_valor_adicionais, p_valor_descontos, p_valor_total,
    p_periodo_gratuito_aplicado, p_autor,
    p_sobreposicao_autorizada,
    case when p_sobreposicao_autorizada then p_autor end,
    case when p_sobreposicao_autorizada then now() end,
    p_retroativa
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
    case
      when p_retroativa then 'Lançamento retroativo'
      when v_da_fila then 'Criada via atendimento assistido · Originada da lista de espera'
      else 'Criada via atendimento assistido'
    end
  );

  return v_id::text;
end;
$$;

revoke execute on function criar_locacao_assistida(
  condicao_locatario, uuid, text, text, text, text, text, timestamptz, timestamptz,
  periodo_dia, integer, text, text, jsonb, forma_pagamento, integer, integer,
  integer, integer, jsonb, jsonb, jsonb, uuid, uuid, integer, boolean, jsonb,
  boolean, boolean
) from public, anon, authenticated;
grant execute on function criar_locacao_assistida(
  condicao_locatario, uuid, text, text, text, text, text, timestamptz, timestamptz,
  periodo_dia, integer, text, text, jsonb, forma_pagamento, integer, integer,
  integer, integer, jsonb, jsonb, jsonb, uuid, uuid, integer, boolean, jsonb,
  boolean, boolean
) to service_role;

-- ---------------------------------------------------------------------------
-- (2) criar_solicitacao_portal: associado NUNCA sobrepõe. Qualquer overlap
--     bloqueante (inclusive autorizado, que sai do índice) → 'conflito_agenda'.
--     Assinatura idêntica → create or replace preserva grants.
-- ---------------------------------------------------------------------------
create or replace function criar_solicitacao_portal(
  p_associado_id uuid,
  p_nome text,
  p_documento text,
  p_email text,
  p_telefone text,
  p_responsavel_nome text,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_periodo periodo_dia,
  p_qtd_pessoas integer,
  p_tipo_evento text,
  p_observacoes text,
  p_respostas jsonb,
  p_forma forma_pagamento,
  p_valor_salas integer,
  p_valor_coffee integer,
  p_valor_total integer,
  p_salas jsonb,
  p_coffee jsonb,
  p_autor uuid,
  p_valor_descontos integer default 0,
  p_periodo_gratuito_aplicado boolean default false,
  p_periodo_gratuito jsonb default null,
  p_adicionais jsonb default '[]'::jsonb,
  p_valor_adicionais integer default 0
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
  perform pg_advisory_xact_lock(hashtextextended('agenda:' || sid, 0))
  from (
    select distinct e->>'sala_id' as sid
    from jsonb_array_elements(p_salas) e
    order by 1
  ) s;

  if exists (
    select 1
    from jsonb_array_elements(p_salas) e
    join agenda_ocupacoes o on o.sala_id = (e->>'sala_id')::uuid
    where o.bloqueante
      and o.periodo && tstzrange(p_inicio, p_fim, '[)')
  ) then
    return 'conflito_agenda';
  end if;

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
$$;

-- ---------------------------------------------------------------------------
-- (3) reagendar_locacao: +p_sobreposicao_autorizada. Reagendar é nova decisão —
--     a autorização não viaja com a locação; o novo slot exige nova confirmação.
--     Conflito bloqueante (excl. a própria) sem autorização → 'conflito_agenda'.
-- ---------------------------------------------------------------------------
drop function if exists reagendar_locacao(
  uuid, status_locacao, timestamptz, timestamptz, periodo_dia, jsonb, integer,
  integer, uuid, jsonb, integer, boolean, jsonb, uuid
);

create function reagendar_locacao(
  p_locacao_id uuid,
  p_de status_locacao,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_periodo periodo_dia,
  p_salas jsonb,
  p_valor_salas int,
  p_valor_total int,
  p_autor uuid,
  p_dados jsonb,
  p_valor_descontos int default 0,
  p_periodo_gratuito_aplicado boolean default false,
  p_periodo_gratuito jsonb default null,
  p_associado_id uuid default null,
  p_sobreposicao_autorizada boolean default false
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  perform pg_advisory_xact_lock(hashtextextended('agenda:' || sid, 0))
  from (
    select distinct e->>'sala_id' as sid
    from jsonb_array_elements(p_salas) e
    order by 1
  ) s;

  if not p_sobreposicao_autorizada and exists (
    select 1
    from jsonb_array_elements(p_salas) e
    join agenda_ocupacoes o on o.sala_id = (e->>'sala_id')::uuid
    where o.bloqueante
      and o.locacao_id is distinct from p_locacao_id
      and o.periodo && tstzrange(p_inicio, p_fim, '[)')
  ) then
    return 'conflito_agenda';
  end if;

  set constraints agenda_sem_sobreposicao deferred;

  update locacoes
    set inicio = p_inicio,
        fim = p_fim,
        periodo = p_periodo,
        valor_salas_centavos = p_valor_salas,
        valor_descontos_centavos = p_valor_descontos,
        valor_total_centavos = p_valor_total,
        periodo_gratuito_aplicado = p_periodo_gratuito_aplicado,
        sobreposicao_autorizada = p_sobreposicao_autorizada,
        sobreposicao_autorizada_por =
          case when p_sobreposicao_autorizada then p_autor end,
        sobreposicao_autorizada_em =
          case when p_sobreposicao_autorizada then now() end
    where id = p_locacao_id and status = p_de;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return 'conflito';
  end if;

  delete from locacao_salas where locacao_id = p_locacao_id;
  insert into locacao_salas (locacao_id, sala_id, valor_centavos)
    select p_locacao_id, (e->>'sala_id')::uuid, (e->>'valor')::int
    from jsonb_array_elements(p_salas) e;

  delete from periodos_gratuitos where locacao_id = p_locacao_id;
  if p_periodo_gratuito is not null and p_associado_id is not null then
    insert into periodos_gratuitos (associado_id, sala_id, locacao_id, ciclo, horas)
    values (
      p_associado_id,
      (p_periodo_gratuito->>'sala_id')::uuid,
      p_locacao_id,
      (p_periodo_gratuito->>'ciclo')::date,
      greatest((p_periodo_gratuito->>'horas')::numeric, 0.5)
    );
  end if;

  insert into locacao_eventos (locacao_id, de, para, autor_user_id, observacao, dados)
    values (p_locacao_id, p_de, p_de, p_autor, 'Reagendamento', p_dados);
  return 'ok';
end;
$$;

revoke execute on function reagendar_locacao(
  uuid, status_locacao, timestamptz, timestamptz, periodo_dia, jsonb, integer,
  integer, uuid, jsonb, integer, boolean, jsonb, uuid, boolean
) from public, anon, authenticated;
grant execute on function reagendar_locacao(
  uuid, status_locacao, timestamptz, timestamptz, periodo_dia, jsonb, integer,
  integer, uuid, jsonb, integer, boolean, jsonb, uuid, boolean
) to service_role;

-- ---------------------------------------------------------------------------
-- (4) transicionar_locacao: guarda no flip para 'aprovada' (primeira linha
--     bloqueante da locação). A constraint parcial não pega comum × autorizada;
--     aqui trava a sala e checa overlap contra qualquer bloqueante (excl. a
--     própria), a menos que ESTA locação já seja autorizada. Assinatura idêntica.
-- ---------------------------------------------------------------------------
create or replace function transicionar_locacao(
  p_locacao_id uuid,
  p_de status_locacao,
  p_para status_locacao,
  p_autor uuid,
  p_motivo text,
  p_observacao text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  if p_para = 'aprovada' then
    perform pg_advisory_xact_lock(hashtextextended('agenda:' || ls.sala_id::text, 0))
    from locacao_salas ls
    where ls.locacao_id = p_locacao_id
    order by ls.sala_id;

    if not coalesce(
         (select sobreposicao_autorizada from locacoes where id = p_locacao_id),
         false
       )
       and exists (
         select 1
         from locacao_salas ls
         join agenda_ocupacoes o on o.sala_id = ls.sala_id
         join locacoes l on l.id = p_locacao_id
         where ls.locacao_id = p_locacao_id
           and o.bloqueante
           and o.locacao_id is distinct from p_locacao_id
           and o.periodo && tstzrange(l.inicio, l.fim, '[)')
       ) then
      return 'conflito_agenda';
    end if;
  end if;

  update locacoes
    set status = p_para,
        motivo_encerramento = case
          when p_para in ('recusada','cancelada') then p_motivo
          else motivo_encerramento
        end
    where id = p_locacao_id and status = p_de;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return 'conflito';
  end if;

  insert into locacao_eventos (locacao_id, de, para, autor_user_id, observacao)
    values (
      p_locacao_id, p_de, p_para, p_autor,
      coalesce(nullif(btrim(p_observacao), ''), nullif(btrim(p_motivo), ''))
    );
  return 'ok';
end;
$$;
