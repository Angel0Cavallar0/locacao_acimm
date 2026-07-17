-- Migration 0016 — Corrige fuso das vigências de preço (Spec 04)
-- O Postgres roda em UTC; `current_date` pode adiantar 1 dia à noite em relação
-- a America/Sao_Paulo, fazendo um preço recém-criado parecer "não vigente" na
-- UI (que calcula o dia em SP). Passamos a datar as vigências pelo dia de SP.

alter table precos_sala
  alter column vigencia set default
    daterange((now() at time zone 'America/Sao_Paulo')::date, null, '[)');

create or replace function reajustar_preco_sala(
  p_sala_id uuid,
  p_condicao condicao_locatario,
  p_periodo periodo_dia,
  p_dias_semana smallint[],
  p_valor_centavos integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_row  precos_sala;
  v_novo_id uuid;
begin
  if array_length(p_dias_semana, 1) is null then
    raise exception 'Selecione ao menos um dia da semana.' using errcode = 'check_violation';
  end if;
  if not (p_dias_semana <@ array[0,1,2,3,4,5,6]::smallint[]) then
    raise exception 'Dias da semana inválidos.' using errcode = 'check_violation';
  end if;

  for v_row in
    select * from precos_sala
    where sala_id = p_sala_id
      and condicao = p_condicao
      and periodo = p_periodo
      and (upper(vigencia) is null or upper(vigencia) > v_hoje)
      and dias_semana && p_dias_semana
  loop
    if v_row.dias_semana <@ p_dias_semana and v_row.dias_semana @> p_dias_semana then
      if lower(v_row.vigencia) >= v_hoje then
        update precos_sala set valor_centavos = p_valor_centavos where id = v_row.id;
        return v_row.id;
      end if;
      update precos_sala
        set vigencia = daterange(lower(v_row.vigencia), v_hoje, '[)')
        where id = v_row.id;
    else
      raise exception 'Conflito de dias com um preço vigente (dias %). Ajuste o agrupamento antes.',
        v_row.dias_semana using errcode = 'exclusion_violation';
    end if;
  end loop;

  insert into precos_sala (sala_id, condicao, periodo, dias_semana, valor_centavos, vigencia)
  values (p_sala_id, p_condicao, p_periodo, p_dias_semana, p_valor_centavos,
          daterange(v_hoje, null, '[)'))
  returning id into v_novo_id;

  return v_novo_id;
end;
$$;

create or replace function encerrar_preco_sala(p_id uuid) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row precos_sala;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into v_row from precos_sala where id = p_id;
  if not found then
    raise exception 'Preço não encontrado.';
  end if;

  if lower(v_row.vigencia) >= v_hoje then
    delete from precos_sala where id = p_id;
  else
    update precos_sala
      set vigencia = daterange(lower(v_row.vigencia), v_hoje, '[)')
      where id = p_id;
  end if;
end;
$$;

revoke execute on function reajustar_preco_sala(uuid, condicao_locatario, periodo_dia, smallint[], integer)
  from public, anon, authenticated;
revoke execute on function encerrar_preco_sala(uuid) from public, anon, authenticated;
