-- Spec 17 §3 — "cancelar (não deleta): cancelado = true → trigger REMOVE a
-- ocupação". A trigger anterior reinseria uma linha NÃO-bloqueante ao cancelar,
-- o que liberava a reserva mas mantinha o slot como 'evento_acimm' na view de
-- disponibilidade (inconsistente no portal/calendário). Agora, ao cancelar, a
-- ocupação é removida por completo; eventos ativos seguem bloqueantes.

create or replace function tg_eventos_agenda()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from agenda_ocupacoes where evento_interno_id = new.id;
  if not new.cancelado then
    insert into agenda_ocupacoes (sala_id, periodo, origem, evento_interno_id, bloqueante)
    values (new.sala_id, tstzrange(new.inicio, new.fim, '[)'), 'evento_interno', new.id, true);
  end if;
  return null;
end;
$$;

-- Limpa eventuais ocupações remanescentes de eventos já cancelados.
delete from agenda_ocupacoes o
using eventos_internos e
where o.evento_interno_id = e.id and e.cancelado;
