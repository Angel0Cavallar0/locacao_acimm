-- Migration 0021 — Assinatura mensal: dias por mês (Spec 04, extensão)
-- Guarda quantos dias no mês a assinatura cobre, para o comparativo com/sem
-- combo na tela.

alter table combos add column if not exists dias_no_mes integer
  check (dias_no_mes is null or dias_no_mes > 0);
