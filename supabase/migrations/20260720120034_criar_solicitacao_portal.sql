-- Migration 0034 — RPC de criação da solicitação pelo associado (Spec 11 §5)
-- Espelha criar_locacao_assistida, mas com semântica do portal:
--  * condição SEMPRE 'associado' (o guard exige situacao = 'ativo');
--  * SEM adicionais de locação (negociados pelo colaborador no detalhe);
--  * criado_por = user do associado; observação de auditoria própria.
-- Toda revalidação (limite de abertas, disponibilidade, preço) vive na server
-- action; aqui é a escrita transacional. security definer + EXECUTE só para
-- service_role (chamada pelo admin client após requireAssociado + ativo fresco).

create or replace function criar_solicitacao_portal(
  p_associado_id uuid,
  p_nome text,
  p_documento text,
  p_email text,
  p_telefone text,
  p_responsavel_nome text,
  p_inicio timestamptz,
  p_fim timestamptz,
  p_periodo periodo_dia,
  p_qtd_pessoas int,
  p_tipo_evento text,
  p_observacoes text,
  p_respostas jsonb,
  p_forma forma_pagamento,
  p_valor_salas int,
  p_valor_coffee int,
  p_valor_total int,
  p_salas jsonb,
  p_coffee jsonb,
  p_autor uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into locacoes (
    condicao, associado_id, locatario_nome, locatario_documento,
    locatario_email, locatario_telefone, responsavel_nome, inicio, fim,
    periodo, qtd_pessoas, tipo_evento, observacoes, respostas_formulario,
    forma_pagamento_preferida, status, valor_salas_centavos,
    valor_coffee_centavos, valor_adicionais_centavos, valor_total_centavos,
    criado_por
  ) values (
    'associado', p_associado_id, p_nome, p_documento,
    p_email, p_telefone, nullif(btrim(coalesce(p_responsavel_nome,'')), ''),
    p_inicio, p_fim, p_periodo, p_qtd_pessoas,
    nullif(btrim(coalesce(p_tipo_evento,'')), ''),
    nullif(btrim(coalesce(p_observacoes,'')), ''),
    coalesce(p_respostas, '{}'::jsonb), p_forma,
    'solicitada', p_valor_salas, p_valor_coffee,
    0, p_valor_total, p_autor
  ) returning id into v_id;

  insert into locacao_salas (locacao_id, sala_id, valor_centavos)
  select v_id, (e->>'sala_id')::uuid, (e->>'valor')::int
  from jsonb_array_elements(p_salas) e;

  if p_coffee is not null then
    insert into coffee_breaks (
      locacao_id, nivel_id, qtd_pessoas, horario_servir,
      adicionais, observacoes, valor_centavos
    ) values (
      v_id,
      (p_coffee->>'nivel_id')::uuid,
      (p_coffee->>'qtd_pessoas')::int,
      case when p_coffee->>'horario_servir' is not null
           then (p_coffee->>'horario_servir')::timestamptz else null end,
      '[]'::jsonb,
      nullif(btrim(coalesce(p_coffee->>'observacoes','')), ''),
      (p_coffee->>'valor')::int
    );
  end if;

  insert into locacao_eventos (locacao_id, de, para, autor_user_id, observacao)
  values (v_id, null, 'solicitada', p_autor, 'Criada pelo associado via portal');

  return v_id;
end;
$$;

revoke execute on function criar_solicitacao_portal(uuid, text, text, text, text, text, timestamptz, timestamptz, periodo_dia, int, text, text, jsonb, forma_pagamento, int, int, int, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function criar_solicitacao_portal(uuid, text, text, text, text, text, timestamptz, timestamptz, periodo_dia, int, text, text, jsonb, forma_pagamento, int, int, int, jsonb, jsonb, uuid) to service_role;
