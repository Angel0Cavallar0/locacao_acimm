-- Migration 0056 — Combo pode exigir "qualquer" coffee break
-- Estende o combo multi-sala: além de vincular um nível específico
-- (coffee_nivel_id), pode exigir apenas que a reserva inclua ALGUM coffee break
-- (coffee_qualquer = true, com coffee_nivel_id nulo). Só relevante para
-- desconto_multi_sala (a action garante false nos demais tipos).

alter table combos
  add column coffee_qualquer boolean not null default false;
