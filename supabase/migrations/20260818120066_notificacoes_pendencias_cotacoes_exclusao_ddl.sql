-- Migration 0066 — DDL para 4 melhorias operacionais:
-- (2) notificação por locação, (4) pendência sem data, (5+9) cotação,
-- (6) exclusão definitiva de locação. Tudo aditivo/defaults seguros —
-- nenhuma mudança de comportamento existente por si só.

-- (2) Notificações por locação (whatsapp/e-mail) — default true preserva o
-- comportamento atual em todas as locações existentes e futuras.
alter table locacoes
  add column notificar_whatsapp boolean not null default true,
  add column notificar_email boolean not null default true;

-- (4) Pendência de locação sem data — registro de intenção/prioridade, sem
-- sala/data fixas (diferente de lista_espera, que é sala+data). Sem valor
-- de crédito (decisão travada com o cliente).
create table pendencias_locacao (
  id uuid primary key default gen_random_uuid(),
  associado_id uuid references associados(id),
  nome text not null,
  contato text not null,
  motivo text,
  observacoes text,
  convertido_locacao_id uuid references locacoes(id),
  arquivado_em timestamptz,
  arquivado_por uuid references auth.users(id),
  arquivado_motivo text,
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);

create index pendencias_locacao_aguardando_idx
  on pendencias_locacao (criado_em)
  where convertido_locacao_id is null and arquivado_em is null;

alter table pendencias_locacao enable row level security;
create policy pendencias_locacao_colaborador_select on pendencias_locacao for select to authenticated
  using (eh_colaborador());

-- (5+9) Cotação de aluguel — orçamento pendente, NÃO reserva agenda (decisão
-- travada: sem checagem de disponibilidade, sem materializar agenda_ocupacoes).
create table cotacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  condicao condicao_locatario not null,
  associado_id uuid references associados(id),
  locatario_nome text not null,
  locatario_documento text,
  locatario_email text,
  locatario_telefone text,
  sala_ids uuid[] not null default '{}',
  data date,
  periodo periodo_dia,
  qtd_pessoas integer,
  parametros jsonb not null default '{}',
  resultado jsonb not null default '{}',
  valor_total_centavos integer not null default 0,
  status text not null default 'pendente' check (status in ('pendente','convertida','arquivada')),
  convertido_locacao_id uuid references locacoes(id),
  criado_por uuid references auth.users(id),
  criado_em timestamptz not null default now()
);

create index cotacoes_status_idx on cotacoes (status);

alter table cotacoes enable row level security;
create policy cotacoes_colaborador_select on cotacoes for select to authenticated
  using (eh_colaborador());

-- (6) Log de exclusão definitiva de locação — SEM FK viva para locacoes (a
-- linha original deixa de existir); preserva o mínimo de rastreabilidade
-- mesmo com a exclusão real dos dados operacionais (coffee/comissão/etc).
create table locacoes_excluidas_log (
  id uuid primary key default gen_random_uuid(),
  locacao_id uuid not null,
  locacao_numero bigint not null,
  resumo jsonb not null,
  excluido_por uuid references auth.users(id),
  excluido_em timestamptz not null default now(),
  motivo text not null
);

-- Auditoria imutável (mesmo padrão de locacao_eventos, migration 0005):
-- nem service role pode alterar/remover um registro de exclusão já gravado.
revoke update, delete on locacoes_excluidas_log from anon, authenticated, service_role;

alter table locacoes_excluidas_log enable row level security;
create policy locacoes_excluidas_log_colaborador_select on locacoes_excluidas_log for select to authenticated
  using (eh_colaborador());
