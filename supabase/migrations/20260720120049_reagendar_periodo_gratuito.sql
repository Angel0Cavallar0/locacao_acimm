-- Spec 20 §5.3 — Reagendamento revalida o período gratuito: ao mudar
-- sala/data/período (ou mês), o benefício entra, sai ou muda de ciclo, com o
-- consumo ajustado na MESMA transação. O app decide a elegibilidade fresca
-- (excluindo o consumo da própria locação) e passa o resultado já apurado.

drop function if exists reagendar_locacao(
  uuid, status_locacao, timestamptz, timestamptz, periodo_dia, jsonb, integer,
  integer, uuid, jsonb
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
  p_associado_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated int;
begin
  set constraints agenda_sem_sobreposicao deferred;

  update locacoes
    set inicio = p_inicio,
        fim = p_fim,
        periodo = p_periodo,
        valor_salas_centavos = p_valor_salas,
        valor_descontos_centavos = p_valor_descontos,
        valor_total_centavos = p_valor_total,
        periodo_gratuito_aplicado = p_periodo_gratuito_aplicado
    where id = p_locacao_id and status = p_de;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return 'conflito';
  end if;

  delete from locacao_salas where locacao_id = p_locacao_id;
  insert into locacao_salas (locacao_id, sala_id, valor_centavos)
    select p_locacao_id, (e->>'sala_id')::uuid, (e->>'valor')::int
    from jsonb_array_elements(p_salas) e;

  -- Devolve o consumo antigo e reinsere conforme a nova elegibilidade.
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
  integer, uuid, jsonb, integer, boolean, jsonb, uuid
) from public, anon, authenticated;
grant execute on function reagendar_locacao(
  uuid, status_locacao, timestamptz, timestamptz, periodo_dia, jsonb, integer,
  integer, uuid, jsonb, integer, boolean, jsonb, uuid
) to service_role;
