-- Migration 0057 — Webhook de sincronização de associados (n8n)
-- Semeia a chave de config com a URL do webhook do n8n que dispara o workflow
-- de sincronização Sophus → associados sob demanda. Editável em
-- Configurações › Webhooks (admin). Acesso via service role, como as demais
-- chaves de `configuracoes`.

insert into configuracoes (chave, valor, descricao) values (
  'webhook_associados',
  '{"url":""}'::jsonb,
  'Webhook (n8n) para sincronizar associados do Sophus sob demanda'
) on conflict (chave) do nothing;
