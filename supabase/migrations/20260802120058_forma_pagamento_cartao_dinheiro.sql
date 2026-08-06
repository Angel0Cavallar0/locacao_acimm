-- Migration 0058 — forma_pagamento: cartão e dinheiro (Ciclo 2 / Spec 29 §3.3)
-- A régua de comissões passa a registrar a forma efetiva do recebimento; a ACIMM
-- recebe também por cartão e dinheiro (além de pix/transferência/boletos).
-- ALTER TYPE ADD VALUE fica ISOLADO nesta migration: o valor recém-criado não pode
-- ser referenciado na mesma transação em que é adicionado.

alter type forma_pagamento add value if not exists 'cartao';
alter type forma_pagamento add value if not exists 'dinheiro';
