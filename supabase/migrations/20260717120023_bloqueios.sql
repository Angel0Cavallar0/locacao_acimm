-- Migration 0023 — Bloqueio manual de sala (Spec 05 §6)
-- Acrescenta motivo + autor à agenda para suportar ocupações de origem
-- 'bloqueio' criadas manualmente pelo colaborador. As funções de trigger que
-- sincronizam locações/eventos NÃO tocam nessas colunas (origem <> 'bloqueio'),
-- então a coerência abaixo é respeitada automaticamente por elas.

alter table agenda_ocupacoes
  add column motivo text,
  add column criado_por uuid references auth.users(id);

comment on column agenda_ocupacoes.motivo is
  'Preenchido apenas quando origem = bloqueio (motivo do bloqueio manual)';

-- garante coerência: bloqueio manual sempre tem motivo; demais origens nunca têm
alter table agenda_ocupacoes
  add constraint bloqueio_exige_motivo
  check (
    (origem = 'bloqueio' and motivo is not null and length(trim(motivo)) > 0)
    or (origem <> 'bloqueio' and motivo is null)
  );
