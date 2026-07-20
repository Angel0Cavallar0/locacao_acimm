-- Migration 0039 — Um contrato por locação (Spec 13 §3)
-- A geração/regeração faz upsert por locação; o app já lê o contrato com
-- maybeSingle. A constraint torna isso correto e permite `on conflict`.

alter table contratos add constraint contratos_locacao_unica unique (locacao_id);
