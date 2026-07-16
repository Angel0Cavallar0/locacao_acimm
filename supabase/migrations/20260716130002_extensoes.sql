-- Migration 0002 — Extensões (Spec 02 §3)
-- btree_gist: exclusão sala_id (=) + período (&&) na agenda.
-- pg_net / pg_cron: infraestrutura de agendamentos (CLAUDE.md §2.1) — jobs
--   só entram nas Fases 4/5, mas as extensões ficam prontas desde já.

create extension if not exists btree_gist with schema extensions;
create extension if not exists pg_net;
create extension if not exists pg_cron;
