-- Coffee break (Spec 08): catálogo de adicionais por nível. São opcionais na
-- reserva (a atendente escolhe quais entram); cada adicional tem valor próprio
-- FIXO por item — não multiplica pelo nº de pessoas. Ao selecionar na reserva,
-- o adicional é copiado para coffee_breaks.adicionais (mesmo shape), então o
-- total já o considera pela via existente.
alter table coffee_niveis
  add column adicionais jsonb not null default '[]'::jsonb;

comment on column coffee_niveis.adicionais is
  'Catálogo de adicionais opcionais do nível: [{"descricao":text,"valor_centavos":int}]. Valor fixo por item — não multiplica por pessoas. Selecionados na reserva viram coffee_breaks.adicionais.';
