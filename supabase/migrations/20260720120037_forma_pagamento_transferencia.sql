-- Migration 0037 — Nova forma de pagamento "transferencia" (Spec 13 §0.2)
-- O modelo real do contrato tem "Transferência Bancária – SICREDI". Cartão sai
-- (removido do template), mas o enum não precisa perder valor. Isolada porque
-- ALTER TYPE ADD VALUE não pode ser usada no mesmo bloco em que o valor é lido.

alter type forma_pagamento add value if not exists 'transferencia';
