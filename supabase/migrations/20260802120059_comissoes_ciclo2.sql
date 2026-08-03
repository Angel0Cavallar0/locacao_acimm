-- Migration 0059 — Comissões: nova regra (Ciclo 2 / Spec 29 §3.1-3.2)
-- O fato gerador passa a ser a QUITAÇÃO do pagamento (recebimento pela ACIMM), não
-- a contratação. Competência = mês da quitação total. A comissão guarda um snapshot
-- do recebimento (data + forma) e um controle pago/não-pago ao colaborador.
-- `previsao_recebimento` no pagamento alimenta as visões de previsão da tela.
-- Tabelas transacionais vazias em produção → sem backfill. Colunas nullable/default
-- → aditivo e retrocompatível com o código já em produção.

alter table comissoes
  add column pago boolean not null default false,
  add column pago_em timestamptz,
  add column pago_por uuid references auth.users(id),
  add column recebido_em timestamptz,
  add column forma_pagamento text,
  add column pagamento_id uuid references pagamentos(id) on delete set null;

comment on column comissoes.competencia is
  'Ciclo 2: mês da QUITAÇÃO total da locação (1º dia do mês em America/Sao_Paulo), não mais o mês do evento.';
comment on column comissoes.pago is
  'Comissão paga ao colaborador (substitui exportada/estornada na UI). Estorno só reverte pago=false.';
comment on column comissoes.recebido_em is
  'Recebimento que gerou a comissão = max(baixa_em) dos pagamentos quitados da locação.';
comment on column comissoes.forma_pagamento is
  'Forma do pagamento quando único; "multiplas" na divisão híbrida.';
comment on column comissoes.pagamento_id is
  'Pagamento vinculado quando há um único registro; NULL na divisão híbrida (não há 1:1).';

-- Previsão de recebimento por pagamento (visões de previsão da tela de comissões).
-- Determinística para boleto de mensalidade; demais formas ficam nulas (estimativa).
alter table pagamentos add column previsao_recebimento date;

comment on column pagamentos.previsao_recebimento is
  'Data prevista de quitação (Ciclo 2). Alimenta as previsões de comissão; determinística p/ boleto de mensalidade.';
