-- Spec 10 §6: contato da ACIMM exibido ao associado (dialog de evento).
insert into configuracoes (chave, valor, descricao) values (
  'contato_acimm',
  '{"telefone": "", "whatsapp": "", "email": ""}'::jsonb,
  'Contatos exibidos ao associado (preencher com os dados oficiais da ACIMM)'
) on conflict (chave) do nothing;

-- Spec 10 §3/§7: ocupações de um dia por sala, lidas SEMPRE pela view
-- `disponibilidade` (nunca `agenda_ocupacoes` direto no portal). Retorna só o
-- estado + intervalo + título de evento — sem `locacao_id` (não vaza terceiro).
create or replace function disponibilidade_no_dia(
  p_inicio timestamptz,
  p_fim timestamptz,
  p_sala_ids uuid[]
) returns table (
  sala_id uuid,
  inicio timestamptz,
  fim timestamptz,
  situacao text,
  evento_titulo text,
  evento_sympla_id text
)
language sql
stable
security definer
set search_path = public
as $$
  select d.sala_id, lower(d.periodo), upper(d.periodo),
         d.situacao, d.evento_titulo, d.evento_sympla_id
  from disponibilidade d
  where d.sala_id = any(p_sala_ids)
    and d.periodo && tstzrange(p_inicio, p_fim, '[)');
$$;

revoke execute on function disponibilidade_no_dia(timestamptz, timestamptz, uuid[]) from public, anon, authenticated;
grant execute on function disponibilidade_no_dia(timestamptz, timestamptz, uuid[]) to service_role;
