-- Spec 22 — Editor de formulário: insumos dos avisos do editor. As respostas
-- ficam em `locacoes.respostas_formulario` chaveadas pelo ID do campo (§3), então
-- os "usos" são consultas de existência de chave / valor no JSONB.
--
-- Padrão do projeto: security definer + search_path fixo, EXECUTE revogado de
-- anon/authenticated (só service role, chamado pelas server actions após guard).

-- Contagem de respostas por campo (nº de locações que responderam cada campo).
create or replace function contar_respostas_campos()
returns table(campo_id text, total bigint)
language sql
security definer
set search_path = public
as $$
  select key as campo_id, count(*)::bigint as total
  from locacoes l, lateral jsonb_object_keys(l.respostas_formulario) as key
  group by key;
$$;

revoke execute on function contar_respostas_campos() from public, anon, authenticated;
grant execute on function contar_respostas_campos() to service_role;

-- Opções realmente usadas por um campo de seleção/multiseleção (aviso ao remover
-- opção — §3). Cobre escalar (seleção) e array (multiseleção).
create or replace function opcoes_em_uso(p_campo_id text)
returns table(opcao text, total bigint)
language sql
security definer
set search_path = public
as $$
  select v as opcao, count(*)::bigint as total
  from locacoes l
  cross join lateral (
    select case
      when jsonb_typeof(l.respostas_formulario -> p_campo_id) = 'array'
        then array(select jsonb_array_elements_text(l.respostas_formulario -> p_campo_id))
      when jsonb_exists(l.respostas_formulario, p_campo_id)
        then array[l.respostas_formulario ->> p_campo_id]
      else array[]::text[]
    end as vals
  ) e
  cross join lateral unnest(e.vals) as v
  where v is not null and v <> ''
  group by v;
$$;

revoke execute on function opcoes_em_uso(text) from public, anon, authenticated;
grant execute on function opcoes_em_uso(text) to service_role;
