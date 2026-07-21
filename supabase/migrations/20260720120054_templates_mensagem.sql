-- Migration 0054 — Templates de mensagem editáveis (Melhorias operacionais §C)
-- Guarda SÓ overrides: ausência de linha = template ativo com o texto padrão do
-- código (templates-padrao.ts). Escrita via service role após guard (sem policy
-- de write, como campos_formulario). O portal nunca lê esta tabela.

create table if not exists templates_mensagem (
  chave text primary key,
  ativo boolean not null default true,
  whatsapp_texto text,
  email_assunto text,
  email_corpo text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);

alter table templates_mensagem enable row level security;

create policy templates_mensagem_colaborador_select on templates_mensagem
  for select to authenticated using (eh_colaborador());
