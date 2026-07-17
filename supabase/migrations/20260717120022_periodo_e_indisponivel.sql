-- Migration 0022 — Período do combo e "sem locação" nos preços (Spec 04)
-- - combos.periodo: período (manhã/tarde/noite/dia inteiro) da assinatura e do
--   evento privativo (horário da locação).
-- - precos_sala.indisponivel: marca um período como sem locação disponível
--   (distinto de "sem preço cadastrado").

alter table combos add column if not exists periodo periodo_dia;

alter table precos_sala add column if not exists indisponivel boolean not null default false;

-- Recria a função de reajuste aceitando o marcador de indisponibilidade.
drop function if exists reajustar_preco_sala(uuid, condicao_locatario, periodo_dia, smallint[], integer);

create or replace function reajustar_preco_sala(
  p_sala_id uuid,
  p_condicao condicao_locatario,
  p_periodo periodo_dia,
  p_dias_semana smallint[],
  p_valor_centavos integer,
  p_indisponivel boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_row  precos_sala;
  v_novo_id uuid;
  v_valor integer := case when p_indisponivel then 0 else p_valor_centavos end;
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
        update precos_sala
          set valor_centavos = v_valor, indisponivel = p_indisponivel
          where id = v_row.id;
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

  insert into precos_sala (sala_id, condicao, periodo, dias_semana, valor_centavos, indisponivel, vigencia)
  values (p_sala_id, p_condicao, p_periodo, p_dias_semana, v_valor, p_indisponivel,
          daterange(v_hoje, null, '[)'))
  returning id into v_novo_id;

  return v_novo_id;
end;
$$;

revoke execute on function reajustar_preco_sala(uuid, condicao_locatario, periodo_dia, smallint[], integer, boolean)
  from public, anon, authenticated;
