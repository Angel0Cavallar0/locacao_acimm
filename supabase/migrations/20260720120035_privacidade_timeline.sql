-- Migration 0035 — Privacidade da linha do tempo do associado (Spec 12 §3.2)
-- A policy de select do associado em `locacao_eventos` (0011) expunha
-- `observacao`, `autor_user_id` e `dados` a uma leitura direta via anon key —
-- notas internas do colaborador vazariam. O associado deixa de ler a tabela
-- diretamente; a linha do tempo do portal é servida por RSC/server action
-- (service role) já SANITIZADA em DTO ({ de, para, criado_em, autorTipo, motivo? }).
-- O colaborador mantém o select.

drop policy if exists locacao_eventos_select on locacao_eventos;
create policy locacao_eventos_select on locacao_eventos for select to authenticated
  using (eh_colaborador());

-- Limites do bucket privado `comprovantes` (Spec 12 §4): pdf/jpeg/png, ≤ 8MB.
-- O bucket já existe (0012, privado) — aqui só reforçamos os limites. Acesso
-- continua exclusivamente por signed URL gerada em server action (service role).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comprovantes', 'comprovantes', false, 8388608,
        array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
