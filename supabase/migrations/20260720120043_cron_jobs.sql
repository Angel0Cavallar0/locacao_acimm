-- Spec 16 — Jobs agendados via pg_cron (CLAUDE.md §2.1). Extensões pg_cron/pg_net
-- e supabase_vault já habilitadas. Nenhum segredo vai em migration: `app_url` e
-- `cron_secret` são semeados MANUALMENTE no Vault (ver README). Enquanto não
-- semeados, `chamar_cron` é um no-op limpo (não chama nada) — os jobs ficam
-- registrados e inertes até o seed.

-- Helper: dispara a rota do app com o CRON_SECRET (lido do Vault).
create or replace function chamar_cron(rota text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text;
  v_secret text;
begin
  select decrypted_secret into v_url
    from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'cron_secret';

  -- Sem os segredos no Vault → no-op (não agenda POST para URL nula).
  if v_url is null or v_secret is null then
    raise notice 'chamar_cron(%): segredos do Vault ausentes — ignorado.', rota;
    return null;
  end if;

  return net.http_post(
    url := rtrim(v_url, '/') || '/api/cron/' || rota,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
end $$;

revoke execute on function chamar_cron(text) from public, anon, authenticated;

-- Agendamentos (horários em UTC — Brasil fixo em UTC-3, sem horário de verão).
-- cron.schedule faz upsert por nome: reaplicar a migration não duplica.
select cron.schedule('notificacoes-retry', '*/15 * * * *', $$select chamar_cron('notificacoes-retry')$$);
select cron.schedule('lembretes',          '0 11 * * *',   $$select chamar_cron('lembretes')$$);   -- 08:00 BRT
select cron.schedule('coffee-pdf',         '0 10 * * 1',   $$select chamar_cron('coffee-pdf')$$);  -- seg 07:00 BRT

-- Contato do setor de compras (recebe o PDF semanal do coffee via WhatsApp).
insert into configuracoes (chave, valor, descricao) values
  ('contato_compras', '{"whatsapp": ""}',
   'WhatsApp do setor de compras (recebe o PDF semanal do coffee)')
on conflict (chave) do nothing;

-- Bucket privado do PDF semanal de compras (acesso só por signed URL).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('coffee-pdfs', 'coffee-pdfs', false, 8388608, array['application/pdf'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Visibilidade no admin: última execução de cada job (§5). Service role só.
create or replace function listar_rotinas_cron()
returns table (
  jobname text,
  schedule text,
  active boolean,
  ultima_status text,
  ultima_inicio timestamptz,
  ultima_fim timestamptz,
  ultima_msg text
)
language sql
security definer
set search_path = public, cron
as $$
  select
    j.jobname::text,
    j.schedule::text,
    j.active,
    d.status::text,
    d.start_time,
    d.end_time,
    d.return_message::text
  from cron.job j
  left join lateral (
    select status, start_time, end_time, return_message
    from cron.job_run_details r
    where r.jobid = j.jobid
    order by r.start_time desc
    limit 1
  ) d on true
  order by j.jobname;
$$;

revoke execute on function listar_rotinas_cron() from public, anon, authenticated;
grant execute on function listar_rotinas_cron() to service_role;
