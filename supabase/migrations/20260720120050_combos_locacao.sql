-- Spec 20 §3 (parte 2) — Aplicação de combos na locação. O efeito financeiro
-- viaja pelos params existentes das RPCs (valor_salas fechado/rateado,
-- valor_descontos, p_salas). Aqui só o vínculo descritivo combo↔locação, gravado
-- por update pós-insert na action (metadado para badge/revalidação).
-- Escopo: desconto_multi_sala + evento_privativo (assinatura_mensal adiada, sem
-- combo_grupo_id).

alter table locacoes add column combo_id uuid references combos(id);
create index locacoes_combo_idx on locacoes (combo_id) where combo_id is not null;
