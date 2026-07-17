-- Migration 0029 — Pessoa responsável pela locação (campo do atendimento assistido)
-- Distinto de criado_por (colaborador que registrou) e de locatario_nome
-- (empresa/razão social). É o contato humano responsável pela reserva.

alter table locacoes add column responsavel_nome text;

-- Recria a RPC de criação incluindo o responsável (nova assinatura).
drop function if exists criar_locacao_assistida(
  condicao_locatario, uuid, text, text, text, text, timestamptz, timestamptz,
  periodo_dia, int, text, text, jsonb, forma_pagamento, int, int, int, int,
  jsonb, jsonb, jsonb, uuid
);

create or replace function criar_locacao_assistida(
  p_condicao condicao_locatario,
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
  p_valor_adicionais int,
  p_valor_total int,
  p_salas jsonb,
  p_coffee jsonb,
  p_adicionais jsonb,
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
    p_condicao, p_associado_id, p_nome, p_documento,
    p_email, p_telefone, nullif(btrim(coalesce(p_responsavel_nome,'')), ''),
    p_inicio, p_fim, p_periodo, p_qtd_pessoas,
    nullif(btrim(coalesce(p_tipo_evento,'')), ''),
    nullif(btrim(coalesce(p_observacoes,'')), ''),
    coalesce(p_respostas, '{}'::jsonb), p_forma,
    'solicitada', p_valor_salas, p_valor_coffee,
    p_valor_adicionais, p_valor_total, p_autor
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
      coalesce(p_coffee->'adicionais', '[]'::jsonb),
      nullif(btrim(coalesce(p_coffee->>'observacoes','')), ''),
      (p_coffee->>'valor')::int
    );
  end if;

  insert into locacao_adicionais (locacao_id, descricao, quantidade, valor_unitario_centavos)
  select v_id, e->>'descricao', (e->>'quantidade')::numeric, (e->>'valor_unitario')::int
  from jsonb_array_elements(coalesce(p_adicionais, '[]'::jsonb)) e;

  insert into locacao_eventos (locacao_id, de, para, autor_user_id, observacao)
  values (v_id, null, 'solicitada', p_autor, 'Criada via atendimento assistido');

  return v_id;
end;
$$;

revoke execute on function criar_locacao_assistida(condicao_locatario, uuid, text, text, text, text, text, timestamptz, timestamptz, periodo_dia, int, text, text, jsonb, forma_pagamento, int, int, int, int, jsonb, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function criar_locacao_assistida(condicao_locatario, uuid, text, text, text, text, text, timestamptz, timestamptz, periodo_dia, int, text, text, jsonb, forma_pagamento, int, int, int, int, jsonb, jsonb, jsonb, uuid) to service_role;
