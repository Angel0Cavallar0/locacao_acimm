-- Migration 0053 — Antecedência mínima de reserva (Melhorias operacionais §A)
-- (1) Por sala: nº de dias de antecedência exigidos para reservar (0 = sem restrição).
-- (2) Global (config): antecedência mínima para pedidos de coffee break.

alter table salas add column if not exists dias_antecedencia_minima integer not null default 0
  check (dias_antecedencia_minima >= 0);

-- Placeholder; a ACIMM ajusta pela tela de coffee sem deploy.
insert into configuracoes (chave, valor, descricao) values (
  'antecedencia_coffee',
  '{"dias":0}'::jsonb,
  'Dias mínimos de antecedência para pedidos de coffee break (0 = sem restrição)'
) on conflict (chave) do nothing;
