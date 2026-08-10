-- Migration 0065 — Comissões por metas: apuração mensal + mês de recebimento (Spec 33)
-- O percentual deixa de ser propriedade da LINHA e passa a ser propriedade da
-- COMPETÊNCIA: faixas por grupo (locação+adicionais / coffee) sobre o total do mês,
-- alíquota única (não progressiva), mais bônus quando as duas metas são batidas.
-- `comissao_competencias` guarda a apuração e o congelamento — sem ela o fechamento
-- não seria auditável nem reproduzível depois de a config mudar.
-- `locacoes.mes_recebimento` passa a mandar na competência (sugerido pela baixa,
-- editável). Adicionais VOLTAM para a base da locação (reverte o Spec 29 §4.1).
-- Aditivo; banco transacional vazio (0 locações/pagamentos/comissões) → sem backfill.
-- ATENÇÃO DE DEPLOY: subir o CÓDIGO ANTES desta migration. O parse novo lê config
-- legada (fallback p/ faixa única), mas o parse ANTIGO não entende `faixas` e
-- devolveria 0% — zerando as comissões.

-- ---------------------------------------------------------------------------
-- (1) Apuração mensal
-- ---------------------------------------------------------------------------
create table comissao_competencias (
  competencia date primary key check (extract(day from competencia) = 1),
  base_locacao_centavos  integer not null default 0 check (base_locacao_centavos  >= 0),
  base_coffee_centavos   integer not null default 0 check (base_coffee_centavos   >= 0),
  percentual_locacao     numeric not null default 0 check (percentual_locacao between 0 and 100),
  percentual_coffee      numeric not null default 0 check (percentual_coffee      between 0 and 100),
  bonus_aplicado         boolean not null default false,
  total_locacao_centavos integer not null default 0 check (total_locacao_centavos >= 0),
  total_coffee_centavos  integer not null default 0 check (total_coffee_centavos  >= 0),
  qtd_linhas             integer not null default 0,
  config_snapshot        jsonb,
  historico              jsonb   not null default '[]'::jsonb,
  apurada_em  timestamptz not null default now(),
  fechada_em  timestamptz,
  fechada_por uuid references auth.users(id),
  criado_em   timestamptz not null default now()
);

comment on table comissao_competencias is
  'Apuração mensal das comissões (Spec 33). Derivada de comissoes; reconstruída por apurar_comissao_competencia. fechada_em não-nulo = congelada (sem coluna status: uma única fonte de verdade).';
comment on column comissao_competencias.config_snapshot is
  'Config de comissões vigente na última apuração — responde "por que 7%?" meses depois, mesmo que a config mude.';
comment on column comissao_competencias.historico is
  'Append-only: [{acao:"fechada"|"reaberta", em, por, percentual_locacao, percentual_coffee, bonus_aplicado, totais}].';
comment on column comissao_competencias.total_locacao_centavos is
  'SOMA DAS LINHAS (não floor(base*pct)): o que se paga é a linha, então o total do mês tem de bater com o somatório do CSV.';

alter table comissao_competencias enable row level security;
create policy comissao_competencias_colaborador_select
  on comissao_competencias for select to authenticated
  using (eh_colaborador());
-- Escrita: service role apenas (padrão do projeto — nenhuma policy de escrita).

-- ---------------------------------------------------------------------------
-- (2) Colunas novas
-- ---------------------------------------------------------------------------
alter table comissoes add column competencia_original date;
comment on column comissoes.competencia_original is
  'Mês real do recebimento quando a competência foi deslocada por já estar fechada (Spec 33 §7.3). NULL = competencia é o próprio mês.';

alter table locacoes add column mes_recebimento date
  check (mes_recebimento is null or extract(day from mes_recebimento) = 1);
comment on column locacoes.mes_recebimento is
  'Mês (1º dia) em que a ACIMM recebe/recebeu. Sugerido por max(baixa_em) na geração; editável pelo colaborador; MANDA na competência da comissão (Spec 33 §8).';

create index locacoes_mes_recebimento_idx on locacoes (mes_recebimento)
  where mes_recebimento is not null;

-- Congelada: nunca foi escrita por nenhum código desde a 0059. As previsões de
-- comissão passam a sair de locacoes.mes_recebimento (mesmo tratamento dado a
-- comissoes.exportada no Ciclo 2).
comment on column pagamentos.previsao_recebimento is
  'CONGELADA (Spec 33): nunca escrita. As previsões de comissão usam locacoes.mes_recebimento.';

-- ---------------------------------------------------------------------------
-- (3) Config v2 — faixas por grupo + bônus por metas
--     Substitui o formato escalar {ativo, percentual}. A linha já existe (0051),
--     então UPDATE. O código tem fallback p/ o formato legado (Spec 33 §4.2).
-- ---------------------------------------------------------------------------
update configuracoes set
  valor = '{
    "versao": 2,
    "locacao": {
      "ativo": true,
      "faixas": [
        { "ate_centavos": 1000000, "percentual": 5 },
        { "ate_centavos": null,    "percentual": 6 }
      ]
    },
    "coffee": {
      "ativo": true,
      "faixas": [
        { "ate_centavos": 1200000, "percentual": 3 },
        { "ate_centavos": null,    "percentual": 5 }
      ]
    },
    "bonus": {
      "ativo": true,
      "percentual": 7,
      "meta_locacao_centavos": 1000000,
      "meta_coffee_centavos": 1200000
    }
  }'::jsonb,
  descricao = 'Comissões por faixa do total do mês, em dois grupos (locação+adicionais e coffee). Alíquota única sobre o total (não progressiva). Bônus opcional quando as duas metas são batidas.'
where chave = 'comissoes';

-- ---------------------------------------------------------------------------
-- (4) RPC de apuração — atomicidade entre as N linhas e o cabeçalho.
--     A DECISÃO (qual faixa, tem bônus) fica no TS; aqui só se aplica
--     floor(base * pct / 100), espelho exato de valorComissao().
--     Lock por competência fecha o TOCTOU de duas baixas simultâneas no mesmo mês;
--     p_base_*_esperada é o CAS que pega a corrida ANTES do lock (o TS recomputa
--     a faixa e chama de novo).
-- ---------------------------------------------------------------------------
create function apurar_comissao_competencia(
  p_competencia date,
  p_pct_locacao numeric,
  p_pct_coffee numeric,
  p_bonus_aplicado boolean,
  p_config jsonb,
  p_base_locacao_esperada integer default null,
  p_base_coffee_esperada integer default null,
  p_fechar boolean default false,
  p_user uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fechada timestamptz;
  v_base_loc integer;
  v_base_cof integer;
  v_qtd integer;
  v_total_loc integer;
  v_total_cof integer;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('comissao_apuracao:' || p_competencia::text, 0)
  );

  select fechada_em into v_fechada
  from comissao_competencias where competencia = p_competencia;

  if v_fechada is not null then
    return jsonb_build_object('ok', false, 'motivo', 'fechada');
  end if;

  select
    coalesce(sum(base_centavos) filter (where origem = 'locacao'), 0),
    coalesce(sum(base_centavos) filter (where origem = 'coffee'), 0),
    count(*)
  into v_base_loc, v_base_cof, v_qtd
  from comissoes
  where competencia = p_competencia and estornada_em is null;

  -- CAS: as bases mudaram entre a leitura do TS e o lock → devolve as reais para
  -- que o chamador recompute a faixa e repita.
  if (p_base_locacao_esperada is not null and p_base_locacao_esperada <> v_base_loc)
     or (p_base_coffee_esperada is not null and p_base_coffee_esperada <> v_base_cof) then
    return jsonb_build_object(
      'ok', false,
      'motivo', 'bases_mudaram',
      'base_locacao_centavos', v_base_loc,
      'base_coffee_centavos', v_base_cof
    );
  end if;

  if p_fechar and v_qtd = 0 then
    return jsonb_build_object('ok', false, 'motivo', 'vazia');
  end if;

  update comissoes set
    percentual = case origem when 'locacao' then p_pct_locacao else p_pct_coffee end,
    valor_centavos = floor(
      base_centavos * (case origem when 'locacao' then p_pct_locacao else p_pct_coffee end) / 100
    )::integer
  where competencia = p_competencia and estornada_em is null;

  select
    coalesce(sum(valor_centavos) filter (where origem = 'locacao'), 0),
    coalesce(sum(valor_centavos) filter (where origem = 'coffee'), 0)
  into v_total_loc, v_total_cof
  from comissoes
  where competencia = p_competencia and estornada_em is null;

  insert into comissao_competencias (
    competencia, base_locacao_centavos, base_coffee_centavos,
    percentual_locacao, percentual_coffee, bonus_aplicado,
    total_locacao_centavos, total_coffee_centavos, qtd_linhas,
    config_snapshot, apurada_em
  ) values (
    p_competencia, v_base_loc, v_base_cof,
    p_pct_locacao, p_pct_coffee, p_bonus_aplicado,
    v_total_loc, v_total_cof, v_qtd,
    p_config, now()
  )
  on conflict (competencia) do update set
    base_locacao_centavos  = excluded.base_locacao_centavos,
    base_coffee_centavos   = excluded.base_coffee_centavos,
    percentual_locacao     = excluded.percentual_locacao,
    percentual_coffee      = excluded.percentual_coffee,
    bonus_aplicado         = excluded.bonus_aplicado,
    total_locacao_centavos = excluded.total_locacao_centavos,
    total_coffee_centavos  = excluded.total_coffee_centavos,
    qtd_linhas             = excluded.qtd_linhas,
    config_snapshot        = excluded.config_snapshot,
    apurada_em             = excluded.apurada_em;

  if p_fechar then
    update comissao_competencias set
      fechada_em = now(),
      fechada_por = p_user,
      historico = historico || jsonb_build_object(
        'acao', 'fechada',
        'em', now(),
        'por', p_user,
        'percentual_locacao', p_pct_locacao,
        'percentual_coffee', p_pct_coffee,
        'bonus_aplicado', p_bonus_aplicado,
        'total_locacao_centavos', v_total_loc,
        'total_coffee_centavos', v_total_cof,
        'qtd_linhas', v_qtd
      )
    where competencia = p_competencia;
  end if;

  return (
    select to_jsonb(c) || jsonb_build_object('ok', true)
    from comissao_competencias c where c.competencia = p_competencia
  );
end;
$$;

revoke execute on function apurar_comissao_competencia(
  date, numeric, numeric, boolean, jsonb, integer, integer, boolean, uuid
) from public, anon, authenticated;
grant execute on function apurar_comissao_competencia(
  date, numeric, numeric, boolean, jsonb, integer, integer, boolean, uuid
) to service_role;

-- ---------------------------------------------------------------------------
-- (5) Reabertura — admin only no app. O guard de "há linha paga" fica no
--     servidor (apuracao.ts): aqui só se garante atomicidade e o histórico.
-- ---------------------------------------------------------------------------
create function reabrir_comissao_competencia(
  p_competencia date,
  p_user uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fechada timestamptz;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('comissao_apuracao:' || p_competencia::text, 0)
  );

  select fechada_em into v_fechada
  from comissao_competencias where competencia = p_competencia;

  if v_fechada is null then
    return jsonb_build_object('ok', false, 'motivo', 'nao_fechada');
  end if;

  update comissao_competencias set
    fechada_em = null,
    fechada_por = null,
    historico = historico || jsonb_build_object(
      'acao', 'reaberta',
      'em', now(),
      'por', p_user,
      'fechada_em_anterior', v_fechada
    )
  where competencia = p_competencia;

  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function reabrir_comissao_competencia(date, uuid)
  from public, anon, authenticated;
grant execute on function reabrir_comissao_competencia(date, uuid)
  to service_role;
