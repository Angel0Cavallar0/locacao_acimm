-- Spec 18 — Google Calendar: fila de reconciliação (espelho unidirecional).
-- A conexão OAuth vive em `google_conexoes` (singleton, já existente). Locações e
-- eventos internos ganham uma flag de pendência; os hooks apenas MARCAM (nunca
-- chamam o Google no caminho do usuário) e o processador reconcilia em lote.

alter table locacoes
  add column if not exists google_sync_pendente boolean not null default false;
alter table eventos_internos
  add column if not exists google_sync_pendente boolean not null default false;

-- Índices parciais: a varredura só olha as linhas pendentes, na ordem de fila.
create index if not exists idx_locacoes_google_pendente
  on locacoes (atualizado_em)
  where google_sync_pendente;
create index if not exists idx_eventos_google_pendente
  on eventos_internos (atualizado_em)
  where google_sync_pendente;

-- Reserva atômica das pendências (padrão do `reservar_notificacoes`, Spec 15):
-- `for update skip locked` + baixa imediata da flag = claim. Rodadas concorrentes
-- (cron + disparo imediato) nunca pegam a mesma linha → sem evento duplicado no
-- Calendar. Falha no processamento RE-MARCA a flag (o app cuida disso). O lote é
-- dividido: locações primeiro, eventos com o saldo restante.
create or replace function reservar_google_pendencias(p_limite int default 30)
returns table (tipo text, ref_id uuid, event_id text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usado int;
begin
  return query
  update locacoes l
     set google_sync_pendente = false
    from (
      select id from locacoes
       where google_sync_pendente
       order by atualizado_em
       for update skip locked
       limit p_limite
    ) sel
   where l.id = sel.id
  returning 'locacao'::text, l.id, l.google_event_id;

  get diagnostics v_usado = row_count;

  if v_usado < p_limite then
    return query
    update eventos_internos e
       set google_sync_pendente = false
      from (
        select id from eventos_internos
         where google_sync_pendente
         order by atualizado_em
         for update skip locked
         limit (p_limite - v_usado)
      ) sel
     where e.id = sel.id
    returning 'evento'::text, e.id, e.google_event_id;
  end if;
end $$;

revoke execute on function reservar_google_pendencias(int)
  from public, anon, authenticated;
grant execute on function reservar_google_pendencias(int) to service_role;

-- Endereço da sede vira `location` do evento no Calendar. Adiciona a chave sem
-- sobrescrever os contatos já preenchidos (merge só quando ausente).
update configuracoes
   set valor = valor || '{"endereco": ""}'::jsonb
 where chave = 'contato_acimm'
   and not (valor ? 'endereco');

-- Reconciliação a cada 15 min (upsert por nome — reaplicar não duplica). Sem
-- Vault semeado, `chamar_cron` é no-op; sem conexão Google ativa, o processador
-- no-op e as flags acumulam até a conta ser conectada (critério de aceite §6).
select cron.schedule(
  'google-reconciliacao',
  '*/15 * * * *',
  $$select chamar_cron('google-reconciliacao')$$
);
