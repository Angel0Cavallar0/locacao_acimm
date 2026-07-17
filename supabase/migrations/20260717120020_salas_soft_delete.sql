-- Migration 0020 — Exclusão lógica de sala (Spec 04, extensão)
-- Excluir uma sala não apaga nada (locações, logs, preços, fotos permanecem).
-- Apenas marca `excluida_em`; a aplicação filtra para sumir da tela.

alter table salas add column if not exists excluida_em timestamptz;
