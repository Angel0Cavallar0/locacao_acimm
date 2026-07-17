-- Migration 0025 — Criação de bloqueio manual (Spec 05 §6)
-- Recebe timestamps (não um literal de range) e monta o tstzrange no servidor,
-- eliminando qualquer ambiguidade de codificação na borda. A violação da
-- constraint de exclusão (23P01) propaga naturalmente para o chamador, que a
-- traduz em mensagem amigável. Chamada via service role após requireColaborador().

create or replace function criar_bloqueio(
  p_sala uuid,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_motivo text,
  p_autor uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into agenda_ocupacoes (sala_id, periodo, origem, bloqueante, motivo, criado_por)
  values (p_sala, tstzrange(p_inicio, p_fim, '[)'), 'bloqueio', true, p_motivo, p_autor)
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function criar_bloqueio(uuid, timestamptz, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function criar_bloqueio(uuid, timestamptz, timestamptz, text, uuid) to service_role;
