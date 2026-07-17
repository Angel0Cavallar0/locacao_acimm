-- Migration 0014 — Bucket de fotos de salas (Spec 04 §3.2)
-- Exceção consciente à regra de buckets privados (Spec 02 §7): fotos de
-- ambiente são conteúdo institucional, sem dado pessoal, e a URL pública
-- permite cache de CDN nas telas do associado.
--
-- Público SOMENTE-LEITURA: nenhuma policy de escrita para authenticated —
-- upload/remoção acontecem apenas via signed URLs geradas por server action
-- (service role). Teto de 50MB por arquivo (limite do plano) e apenas imagens.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'salas-fotos',
  'salas-fotos',
  true,
  52428800,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
