-- Migration 0027 — Horários dos períodos + busca de associados (Spec 07)

-- (1) Elo período_dia → inicio/fim. Placeholder; a ACIMM confirma depois.
-- Alterar este registro muda os horários do formulário sem deploy.
insert into configuracoes (chave, valor, descricao) values (
  'horarios_periodos',
  '{"manha":{"inicio":"08:00","fim":"12:00"},
    "tarde":{"inicio":"13:00","fim":"18:00"},
    "noite":{"inicio":"18:00","fim":"23:00"},
    "dia_inteiro":{"inicio":"08:00","fim":"18:00"}}'::jsonb,
  'Horários padrão de cada período de locação (placeholder — confirmar com a ACIMM)'
) on conflict (chave) do nothing;

-- (2) Busca de associado (autocomplete do atendimento assistido). Usa o índice
-- full-text existente (associados_busca_idx, portuguese + imm_unaccent) e casa
-- documento por prefixo (>= 3 dígitos). Ativos primeiro. Chamada via service
-- role após requireColaborador().
create or replace function buscar_associados(p_termo text, p_limite int default 10)
returns table (
  id uuid,
  nome text,
  razao_social text,
  documento text,
  tipo_documento tipo_documento,
  emails text[],
  telefone text,
  celular text,
  whatsapp text,
  situacao situacao_associado
)
language sql
stable
security definer
set search_path = public
as $$
  select a.id, a.nome, a.razao_social, a.documento, a.tipo_documento,
         a.emails, a.telefone, a.celular, a.whatsapp, a.situacao
  from associados a
  where
    to_tsvector('portuguese', imm_unaccent(coalesce(a.nome,'') || ' ' || coalesce(a.razao_social,'')))
      @@ plainto_tsquery('portuguese', imm_unaccent(coalesce(p_termo,'')))
    or (
      length(regexp_replace(coalesce(p_termo,''), '\D', '', 'g')) >= 3
      and a.documento like regexp_replace(p_termo, '\D', '', 'g') || '%'
    )
  order by (a.situacao = 'ativo') desc, a.nome
  limit least(coalesce(p_limite, 10), 25);
$$;

revoke execute on function buscar_associados(text, int) from public, anon, authenticated;
grant execute on function buscar_associados(text, int) to service_role;
