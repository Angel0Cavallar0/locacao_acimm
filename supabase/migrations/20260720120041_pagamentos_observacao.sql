-- Spec 14 — Pagamentos: observação por registro + seed idempotente dos dados bancários.
-- A coluna `observacao` guarda referências operacionais ("boleto enviado em 10/08",
-- nº do boleto, etc.). O boleto NÃO é anexado no sistema na v1 (emissão externa Sicredi).

alter table pagamentos add column if not exists observacao text;

-- Idempotente com a 0038 (contrato_base, Spec 13): quem rodar primeiro cria, o outro ignora.
insert into configuracoes (chave, valor, descricao) values
  (
    'dados_pagamento',
    '{"banco":"SICREDI","codigo_banco":"748","agencia":"0718","conta":"91717-2","pix":""}'::jsonb,
    'Dados bancários exibidos no contrato e nas instruções de pagamento'
  )
on conflict (chave) do nothing;
