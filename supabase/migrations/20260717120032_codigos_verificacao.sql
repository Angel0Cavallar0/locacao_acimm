-- Spec 09: códigos de verificação do primeiro acesso do associado.
-- Código de 6 dígitos enviado por e-mail; guardado só como hash (bcrypt via
-- pgcrypto). Acesso exclusivo via service role (RLS on, sem policy).

create table codigos_verificacao (
  id uuid primary key default gen_random_uuid(),
  associado_id uuid not null references associados(id) on delete cascade,
  codigo_hash text not null,
  expira_em timestamptz not null,
  tentativas integer not null default 0,
  usado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index codigos_verificacao_lookup_idx
  on codigos_verificacao (associado_id, criado_em desc);

alter table codigos_verificacao enable row level security;
-- nenhuma policy: acesso exclusivo via service role

-- Cria um novo código (bcrypt) e invalida os anteriores não usados do associado.
create or replace function criar_codigo_verificacao(
  p_associado_id uuid,
  p_codigo text,
  p_ttl_min integer default 15
) returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  update codigos_verificacao
     set usado_em = now()
   where associado_id = p_associado_id and usado_em is null;

  insert into codigos_verificacao (associado_id, codigo_hash, expira_em)
  values (
    p_associado_id,
    crypt(p_codigo, gen_salt('bf')),
    now() + make_interval(mins => p_ttl_min)
  );
end;
$$;

-- Verifica atomicamente: incrementa tentativas, respeita expiração e limite.
-- Retorna: 'ok' | 'invalido' | 'expirado' | 'excedido' | 'inexistente'.
create or replace function verificar_codigo_verificacao(
  p_associado_id uuid,
  p_codigo text,
  p_max_tentativas integer default 5
) returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v codigos_verificacao;
begin
  select * into v
    from codigos_verificacao
   where associado_id = p_associado_id and usado_em is null
   order by criado_em desc
   limit 1
   for update;

  if not found then return 'inexistente'; end if;
  if v.expira_em < now() then return 'expirado'; end if;
  if v.tentativas >= p_max_tentativas then return 'excedido'; end if;

  update codigos_verificacao set tentativas = tentativas + 1 where id = v.id;

  if v.codigo_hash = crypt(p_codigo, v.codigo_hash) then
    update codigos_verificacao set usado_em = now() where id = v.id;
    return 'ok';
  end if;

  if v.tentativas + 1 >= p_max_tentativas then return 'excedido'; end if;
  return 'invalido';
end;
$$;

revoke execute on function criar_codigo_verificacao(uuid, text, integer) from public, anon, authenticated;
revoke execute on function verificar_codigo_verificacao(uuid, text, integer) from public, anon, authenticated;
grant execute on function criar_codigo_verificacao(uuid, text, integer) to service_role;
grant execute on function verificar_codigo_verificacao(uuid, text, integer) to service_role;
