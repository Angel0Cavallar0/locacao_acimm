-- Migration 0067 — RPCs para as melhorias da migration 0066.

-- criar_locacao_assistida ganha p_notificar_whatsapp/p_notificar_email
-- (Spec notificação por locação) e p_pendencia_id (mesmo tratamento que já
-- existe para p_fila_espera_id: marca convertido_locacao_id ao criar).
drop function public.criar_locacao_assistida(
  condicao_locatario, uuid, text, text, text, text, text,
  timestamptz, timestamptz, periodo_dia, integer, text, text, jsonb,
  forma_pagamento, integer, integer, integer, integer, jsonb, jsonb, jsonb,
  uuid, uuid, integer, boolean, jsonb, boolean, boolean
);

create function public.criar_locacao_assistida(
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
  p_fila_espera_id uuid default null::uuid,
  p_valor_descontos integer default 0,
  p_periodo_gratuito_aplicado boolean default false,
  p_periodo_gratuito jsonb default null::jsonb,
  p_sobreposicao_autorizada boolean default false,
  p_retroativa boolean default false,
  p_notificar_whatsapp boolean default true,
  p_notificar_email boolean default true,
  p_pendencia_id uuid default null::uuid
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id uuid;
  v_da_fila boolean := false;
  v_pg_sala uuid;
  v_pg_ciclo date;
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
    retroativa, notificar_whatsapp, notificar_email
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
    p_retroativa, p_notificar_whatsapp, p_notificar_email
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

  if p_pendencia_id is not null then
    update pendencias_locacao
      set convertido_locacao_id = v_id
      where id = p_pendencia_id
        and convertido_locacao_id is null
        and arquivado_em is null;
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
      when p_pendencia_id is not null then 'Criada via atendimento assistido · Originada de pendência sem data'
      when v_da_fila then 'Criada via atendimento assistido · Originada da lista de espera'
      else 'Criada via atendimento assistido'
    end
  );

  return v_id::text;
end;
$function$;

revoke all on function public.criar_locacao_assistida from public, anon, authenticated;
grant execute on function public.criar_locacao_assistida to service_role;

-- Nova RPC: exclusão definitiva de locação (item 6). Apaga de verdade
-- (cascade cuida de locacao_salas/adicionais/locacao_eventos/coffee/
-- contratos/pagamentos/periodos_gratuitos/agenda_ocupacoes), mas grava um
-- log separado (sem FK viva, imutável) ANTES de apagar, e bloqueia se
-- houver comissão em competência já fechada.
create function public.excluir_locacao_definitivamente(
  p_locacao_id uuid,
  p_autor uuid,
  p_motivo text
)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_resumo jsonb;
  v_numero bigint;
begin
  select
    l.numero,
    jsonb_build_object(
      'numero', l.numero,
      'status', l.status,
      'locatario_nome', l.locatario_nome,
      'inicio', l.inicio,
      'fim', l.fim,
      'valor_total_centavos', l.valor_total_centavos,
      'salas', (
        select coalesce(jsonb_agg(s.nome), '[]'::jsonb)
        from locacao_salas ls join salas s on s.id = ls.sala_id
        where ls.locacao_id = l.id
      )
    )
  into v_numero, v_resumo
  from locacoes l
  where l.id = p_locacao_id;

  if v_numero is null then
    return 'nao_encontrada';
  end if;

  if exists (
    select 1
    from comissoes c
    join comissao_competencias cc on cc.competencia = c.competencia
    where c.locacao_id = p_locacao_id
      and cc.fechada_em is not null
  ) then
    return 'competencia_fechada';
  end if;

  delete from comissoes where locacao_id = p_locacao_id;

  update lista_espera set convertido_locacao_id = null
    where convertido_locacao_id = p_locacao_id;
  update pendencias_locacao set convertido_locacao_id = null
    where convertido_locacao_id = p_locacao_id;
  update cotacoes set convertido_locacao_id = null
    where convertido_locacao_id = p_locacao_id;

  insert into locacoes_excluidas_log (
    locacao_id, locacao_numero, resumo, excluido_por, motivo
  ) values (
    p_locacao_id, v_numero, v_resumo, p_autor, p_motivo
  );

  delete from locacoes where id = p_locacao_id;

  return 'ok';
end;
$function$;

revoke all on function public.excluir_locacao_definitivamente from public, anon, authenticated;
grant execute on function public.excluir_locacao_definitivamente to service_role;
