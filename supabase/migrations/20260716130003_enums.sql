-- Migration 0003 — Enums do domínio (Spec 02 §4)

create type periodo_dia        as enum ('manha','tarde','noite','dia_inteiro');
create type condicao_locatario as enum ('associado','nao_associado');
create type status_locacao     as enum ('rascunho','solicitada','em_analise','aprovada',
  'contrato_enviado','contrato_assinado','aguardando_pagamento','confirmada',
  'realizada','finalizada','recusada','cancelada');
create type forma_pagamento    as enum ('pix','boleto_avulso','boleto_mensalidade','isento');
create type status_pagamento   as enum ('pendente','pago','isento','estornado');
create type status_contrato    as enum ('pendente','enviado','assinado','recusado','cancelado');
create type prioridade_evento  as enum ('alta','media','baixa');
create type origem_ocupacao    as enum ('locacao','evento_interno','bloqueio');
create type canal_notificacao  as enum ('whatsapp','email');
create type status_notificacao as enum ('pendente','enviada','falha');
create type origem_comissao    as enum ('locacao','coffee');
create type tipo_campo         as enum ('texto','texto_longo','numero','selecao','multiselecao','booleano','data');
