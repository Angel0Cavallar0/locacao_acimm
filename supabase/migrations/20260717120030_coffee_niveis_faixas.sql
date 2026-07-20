-- Coffee break (Spec 08, revisão): o nível ganha descrição textual e preço por
-- FAIXA de pessoas (valor POR PESSOA que varia conforme a faixa). O valor único
-- por pessoa (valor_pessoa_centavos) dá lugar às faixas. A composição deixa de
-- ser "por pessoa": cada item passa a ter quantidade fixa por pedido.
-- Sem dados (0 níveis / 0 coffee_breaks) — alteração direta, sem backfill.

alter table coffee_niveis add column descricao text;

alter table coffee_niveis
  add column faixas_preco jsonb not null default '[]'::jsonb;

comment on column coffee_niveis.faixas_preco is
  'Faixas de preço por nº de pessoas: [{"min_pessoas":int,"max_pessoas":int|null,"valor_pessoa_centavos":int}]. O valor é POR PESSOA dentro da faixa.';
comment on column coffee_niveis.composicao is
  'Itens do nível (base da lista de compras): [{"item":text,"qtd":number,"unidade":text}]. Quantidade FIXA por pedido — não é por pessoa.';

alter table coffee_niveis drop column valor_pessoa_centavos;
