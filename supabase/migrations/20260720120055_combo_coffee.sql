-- Migration 0055 — Coffee break obrigatório no combo multi-sala
-- Vincula um nível de coffee a um combo `desconto_multi_sala`: o desconto nas
-- salas só se aplica se a reserva incluir esse coffee (condição obrigatória).
-- Nullable — combos sem vínculo seguem idênticos; só o multi-sala usa o campo
-- (a action garante null nos demais tipos).

alter table combos add column coffee_nivel_id uuid references coffee_niveis(id);
