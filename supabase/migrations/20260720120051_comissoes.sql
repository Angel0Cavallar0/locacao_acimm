-- Spec 21 — Comissões: geração automática na confirmação + estorno + exportação.
--
-- Estorno sem hard delete (padrão do schema): `estornada_em` carimba a linha e
-- ela sai da unicidade (índice parcial) — assim uma locação re-confirmada após
-- cancelamento gera comissão nova, e o histórico estornado é preservado (badge).
--
-- `base_centavos` e `percentual` são SNAPSHOT (Spec 21 §3): o valor é congelado
-- na confirmação e mudar a config depois NÃO recalcula. Guardamos a base para o
-- CSV (§5, coluna `base_centavos`) e o percentual para auditoria — sem depender
-- de recomputar a partir da locação (que poderia divergir).

alter table comissoes add column estornada_em timestamptz;
alter table comissoes add column base_centavos integer not null default 0;
alter table comissoes add column percentual numeric not null default 0;

-- Idempotência da geração: uma comissão viva por (locação, origem). Reprocessar
-- o hook `confirmada` não duplica; estornadas não contam (índice parcial).
create unique index comissoes_unicidade_idx
  on comissoes (locacao_id, origem)
  where estornada_em is null;

-- Filtros da tela por competência/estorno.
create index comissoes_competencia_idx on comissoes (competencia);

insert into configuracoes (chave, valor, descricao) values
('comissoes', '{
  "locacao": { "ativo": false, "percentual": 0 },
  "coffee":  { "ativo": false, "percentual": 0 }
}', 'Percentuais de comissão por origem. Base locação: valor das salas líquido de descontos + adicionais; base coffee: valor do coffee. Ativar quando a ACIMM definir os percentuais.')
on conflict (chave) do nothing;
