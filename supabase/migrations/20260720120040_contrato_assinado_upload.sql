-- Migration 0040 — Upload do contrato assinado pelo associado (revisão Spec 13)
-- O associado baixa o contrato, assina e envia o assinado de volta; o
-- colaborador baixa, confere e marca como assinado (transição já existente).
-- Guarda o caminho do PDF assinado no bucket privado `contratos`.

alter table contratos add column pdf_assinado_url text;

-- Limites do bucket privado `contratos` (já existe): pdf/jpeg/png, ≤ 8MB.
-- Cobre o PDF gerado pelo servidor e o assinado enviado pelo associado.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('contratos', 'contratos', false, 8388608,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
