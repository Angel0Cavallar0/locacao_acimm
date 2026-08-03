-- Migration 0060 — Catálogo de serviços adicionais (Ciclo 2 / Spec 30 §2)
-- Os adicionais de locação deixam de ser texto livre e ganham um catálogo
-- cadastrável com três modelos de cobrança, vínculo opcional a sala e flags que
-- geram etapas de checklist. O texto livre continua válido (servico_adicional_id
-- nulo). Aditivo: nenhuma locação existente é afetada.

create type modelo_cobranca_adicional as enum (
  'por_unidade',
  'fixo_evento',
  'sob_consulta'
);

create table servicos_adicionais (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text, -- vai para o contrato
  modelo_cobranca modelo_cobranca_adicional not null,
  unidade text, -- certificado, montagem, cadeira, publicacao, evento…
  valor_unitario_centavos integer
    check (valor_unitario_centavos is null or valor_unitario_centavos >= 0),
  sala_id uuid references salas(id), -- null = qualquer sala
  requer_aprovacao boolean not null default false,
  sujeito_disponibilidade boolean not null default false,
  ativo boolean not null default true,
  excluido_em timestamptz, -- soft-delete
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- sob_consulta não tem preço; os demais modelos exigem valor.
  constraint servico_valor_por_modelo check (
    (modelo_cobranca = 'sob_consulta' and valor_unitario_centavos is null)
    or (modelo_cobranca <> 'sob_consulta' and valor_unitario_centavos is not null)
  )
);

create trigger servicos_adicionais_set_atualizado_em
  before update on servicos_adicionais
  for each row execute function set_atualizado_em();

create index servicos_adicionais_disponiveis_idx
  on servicos_adicionais (sala_id)
  where ativo and excluido_em is null;

-- RLS: leitura de colaborador; escrita só service role (padrão do schema). O
-- portal lê o catálogo ativo via RSC/service role.
alter table servicos_adicionais enable row level security;
create policy servicos_adicionais_colaborador_select on servicos_adicionais
  for select using (eh_colaborador());

-- Vínculo dos adicionais da locação ao catálogo + status das flags (checklist).
alter table locacao_adicionais
  add column servico_adicional_id uuid references servicos_adicionais(id),
  add column aprovacao_status text
    check (aprovacao_status in ('pendente', 'aprovado')),
  add column disponibilidade_status text
    check (disponibilidade_status in ('pendente', 'confirmado'));

comment on column locacao_adicionais.servico_adicional_id is
  'Item do catálogo servicos_adicionais; NULL = adicional de texto livre.';
comment on column locacao_adicionais.aprovacao_status is
  'Etapa de aprovação prévia (ex.: arte de divulgação): pendente|aprovado. NULL = n/a.';
comment on column locacao_adicionais.disponibilidade_status is
  'Etapa de confirmação de disponibilidade (ex.: cozinha): pendente|confirmado. NULL = n/a.';

-- Carga inicial (§8.3) — idempotente por nome.
insert into servicos_adicionais
  (nome, descricao, modelo_cobranca, unidade, valor_unitario_centavos,
   sala_id, requer_aprovacao, sujeito_disponibilidade)
select v.* from (values
  ('Impressão de certificados',
   'Impressão de certificados a partir do arquivo digital fornecido pelo contratante.',
   'por_unidade'::modelo_cobranca_adicional, 'certificado', 350, null::uuid, false, false),
  ('Montagem personalizada da Sala Cinza',
   'Montagem personalizada da Sala Cinza em formato "U", realizada antes do evento.',
   'fixo_evento', 'montagem', 5000,
   (select id from salas where nome = 'Sala Cinza' limit 1), false, false),
  ('Cadeiras adicionais',
   'Cadeiras adicionais para a Sala de Reunião.',
   'por_unidade', 'cadeira', 1000,
   (select id from salas where nome = 'Sala de Reunião' limit 1), false, false),
  ('Divulgação nas redes sociais da ACIMM',
   'Divulgação do evento nas redes sociais da ACIMM; a arte deve ser aprovada com a logomarca da ACIMM como apoiadora.',
   'por_unidade', 'publicacao', 10000, null, true, false),
  ('Uso da Cozinha (forno)',
   'Uso da cozinha da sede (forno), sujeito à disponibilidade.',
   'fixo_evento', 'locacao', 10000, null, false, true),
  ('Segurança para o evento',
   'Contratação de segurança para o evento.',
   'fixo_evento', 'evento', 25000, null, false, false),
  ('Pedestal de microfone',
   'Pedestal de microfone — valor sob consulta após cotação.',
   'sob_consulta', 'unidade', null, null, false, false),
  ('Banheirista',
   'Serviço de banheirista para eventos grandes; a cotação prevê 2 banheiros.',
   'sob_consulta', 'evento', null, null, false, false)
) as v(nome, descricao, modelo_cobranca, unidade, valor_unitario_centavos,
       sala_id, requer_aprovacao, sujeito_disponibilidade)
where not exists (
  select 1 from servicos_adicionais s where s.nome = v.nome
);
