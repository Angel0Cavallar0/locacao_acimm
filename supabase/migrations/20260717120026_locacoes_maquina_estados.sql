-- Migration 0026 — Máquina de estados e reagendamento de locações (Spec 06)

-- (1) Período da locação: todas as salas de uma locação compartilham a mesma
-- janela (um inicio/fim), logo um único período por locação. Necessário para
-- recalcular preço no reagendamento via resolverPreco(). Preenchido na criação
-- (Spec 07); nulo nas locações pré-existentes (nenhuma ainda).
alter table locacoes add column periodo periodo_dia;

-- (2) Constraint de exclusão passa a DEFERRABLE (mantém checagem imediata por
-- padrão). O reagendamento faz várias alterações na agenda numa só transação
-- (novo horário + troca de salas); adiar a checagem para o commit evita falso
-- conflito por estado intermediário — só o estado final é validado.
alter table agenda_ocupacoes drop constraint agenda_sem_sobreposicao;
alter table agenda_ocupacoes
  add constraint agenda_sem_sobreposicao
  exclude using gist (sala_id with =, periodo with &&) where (bloqueante)
  deferrable initially immediate;

-- (3) Transição de status — compare-and-swap atômico no status (concorrência),
-- registro em locacao_eventos na mesma transação. O trigger da agenda reage
-- sozinho ao novo status; um 23P01 (aprovação em horário já ocupado) propaga
-- para o chamador tratar. security definer para escrever em locacao_eventos
-- (que tem UPDATE/DELETE revogados) e ignorar RLS.
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
  update locacoes
    set status = p_para,
        motivo_encerramento = case
          when p_para in ('recusada','cancelada') then p_motivo
          else motivo_encerramento
        end
    where id = p_locacao_id and status = p_de;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return 'conflito';  -- status mudou sob os pés do chamador
  end if;

  insert into locacao_eventos (locacao_id, de, para, autor_user_id, observacao)
    values (
      p_locacao_id, p_de, p_para, p_autor,
      coalesce(nullif(btrim(p_observacao), ''), nullif(btrim(p_motivo), ''))
    );
  return 'ok';
end;
$$;

-- (4) Reagendamento — novo horário/período e/ou conjunto de salas, com valores
-- já recalculados pela aplicação (resolverPreco). CAS no status esperado;
-- adia a constraint para validar só o estado final. Registra antes/depois.
create or replace function reagendar_locacao(
  p_locacao_id uuid,
  p_de status_locacao,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_periodo periodo_dia,
  p_salas jsonb,             -- [{"sala_id": uuid, "valor": int}]
  p_valor_salas int,
  p_valor_total int,
  p_autor uuid,
  p_dados jsonb              -- { antes: {...}, depois: {...} }
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
        valor_total_centavos = p_valor_total
    where id = p_locacao_id and status = p_de;
  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    return 'conflito';
  end if;

  delete from locacao_salas where locacao_id = p_locacao_id;
  insert into locacao_salas (locacao_id, sala_id, valor_centavos)
    select p_locacao_id, (e->>'sala_id')::uuid, (e->>'valor')::int
    from jsonb_array_elements(p_salas) e;

  insert into locacao_eventos (locacao_id, de, para, autor_user_id, observacao, dados)
    values (p_locacao_id, p_de, p_de, p_autor, 'Reagendamento', p_dados);
  return 'ok';
end;
$$;

revoke execute on function transicionar_locacao(uuid, status_locacao, status_locacao, uuid, text, text) from public, anon, authenticated;
grant execute on function transicionar_locacao(uuid, status_locacao, status_locacao, uuid, text, text) to service_role;

revoke execute on function reagendar_locacao(uuid, status_locacao, timestamptz, timestamptz, periodo_dia, jsonb, int, int, uuid, jsonb) from public, anon, authenticated;
grant execute on function reagendar_locacao(uuid, status_locacao, timestamptz, timestamptz, periodo_dia, jsonb, int, int, uuid, jsonb) to service_role;
