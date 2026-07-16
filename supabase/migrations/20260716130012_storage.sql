-- Migration 0012 — Storage (Spec 02 §7)
-- Buckets privados. Nenhuma policy pública: o acesso é sempre por URL
-- assinada gerada em server action (colaborador: qualquer; associado: apenas
-- da própria locação). Service role gera as URLs ignorando RLS.

insert into storage.buckets (id, name, public)
values
  ('contratos', 'contratos', false),
  ('comprovantes', 'comprovantes', false)
on conflict (id) do nothing;
