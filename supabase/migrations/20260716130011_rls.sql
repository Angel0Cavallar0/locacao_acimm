-- Migration 0011 — RLS e view de disponibilidade (Spec 02 §6)
-- Padrão do projeto: NENHUMA policy de escrita. Toda mutação passa pelo
-- client service role em server actions (CLAUDE.md §4). RLS gate só leitura,
-- com privilégio mínimo.

-- ---------------------------------------------------------------------------
-- Funções auxiliares
-- ---------------------------------------------------------------------------

create or replace function eh_colaborador() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from colaboradores where user_id = auth.uid() and ativo);
$$;

-- true quando a locação pertence ao associado logado (via associados.user_id).
create or replace function locacao_do_usuario(p_locacao_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1
    from locacoes l
    join associados a on a.id = l.associado_id
    where l.id = p_locacao_id and a.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Catálogo: colaborador vê tudo; associado vê apenas ativo
-- ---------------------------------------------------------------------------

alter table salas enable row level security;
create policy salas_select on salas for select to authenticated
  using (eh_colaborador() or ativa);

alter table coffee_niveis enable row level security;
create policy coffee_niveis_select on coffee_niveis for select to authenticated
  using (eh_colaborador() or ativo);

alter table campos_formulario enable row level security;
create policy campos_formulario_select on campos_formulario for select to authenticated
  using (eh_colaborador() or ativo);

alter table precos_sala enable row level security;
create policy precos_sala_select on precos_sala for select to authenticated
  using (eh_colaborador() or vigencia @> current_date);

-- ---------------------------------------------------------------------------
-- Locações e filhos: colaborador vê tudo; associado só as próprias
-- ---------------------------------------------------------------------------

alter table locacoes enable row level security;
create policy locacoes_select on locacoes for select to authenticated
  using (
    eh_colaborador()
    or associado_id in (select a.id from associados a where a.user_id = auth.uid())
  );

alter table locacao_salas enable row level security;
create policy locacao_salas_select on locacao_salas for select to authenticated
  using (eh_colaborador() or locacao_do_usuario(locacao_id));

alter table locacao_adicionais enable row level security;
create policy locacao_adicionais_select on locacao_adicionais for select to authenticated
  using (eh_colaborador() or locacao_do_usuario(locacao_id));

alter table locacao_eventos enable row level security;
create policy locacao_eventos_select on locacao_eventos for select to authenticated
  using (eh_colaborador() or locacao_do_usuario(locacao_id));

alter table coffee_breaks enable row level security;
create policy coffee_breaks_select on coffee_breaks for select to authenticated
  using (eh_colaborador() or locacao_do_usuario(locacao_id));

alter table contratos enable row level security;
create policy contratos_select on contratos for select to authenticated
  using (eh_colaborador() or locacao_do_usuario(locacao_id));

alter table pagamentos enable row level security;
create policy pagamentos_select on pagamentos for select to authenticated
  using (eh_colaborador() or locacao_do_usuario(locacao_id));

-- ---------------------------------------------------------------------------
-- Agenda: só colaborador (associado consulta pela view abaixo)
-- ---------------------------------------------------------------------------

alter table agenda_ocupacoes enable row level security;
create policy agenda_ocupacoes_colaborador_select on agenda_ocupacoes for select to authenticated
  using (eh_colaborador());

-- ---------------------------------------------------------------------------
-- Tabelas internas: apenas colaborador
-- ---------------------------------------------------------------------------

alter table eventos_internos enable row level security;
create policy eventos_internos_colaborador_select on eventos_internos for select to authenticated
  using (eh_colaborador());

alter table lista_espera enable row level security;
create policy lista_espera_colaborador_select on lista_espera for select to authenticated
  using (eh_colaborador());

alter table periodos_gratuitos enable row level security;
create policy periodos_gratuitos_colaborador_select on periodos_gratuitos for select to authenticated
  using (eh_colaborador());

alter table comissoes enable row level security;
create policy comissoes_colaborador_select on comissoes for select to authenticated
  using (eh_colaborador());

alter table configuracoes enable row level security;
create policy configuracoes_colaborador_select on configuracoes for select to authenticated
  using (eh_colaborador());

alter table notificacoes enable row level security;
create policy notificacoes_colaborador_select on notificacoes for select to authenticated
  using (eh_colaborador());

alter table google_conexoes enable row level security;
create policy google_conexoes_colaborador_select on google_conexoes for select to authenticated
  using (eh_colaborador());

-- ---------------------------------------------------------------------------
-- View de disponibilidade para o associado (sem expor dados de terceiros).
-- security_invoker = false → roda como owner, ignorando a ausência de policy
-- de select do associado em agenda_ocupacoes. Nunca projeta locacao_id nem
-- qualquer dado do locatário; distingue os 3 estados da regra de conflito.
-- ---------------------------------------------------------------------------

create view disponibilidade with (security_invoker = false) as
  select
    o.sala_id,
    o.periodo,
    case
      when o.origem = 'evento_interno' then 'evento_acimm'
      when o.bloqueante                then 'ocupado'
      else                                  'solicitado'   -- pendente de aprovação
    end as situacao,
    e.titulo          as evento_titulo,                    -- null exceto evento ACIMM
    e.sympla_event_id as evento_sympla_id
  from agenda_ocupacoes o
  left join eventos_internos e on e.id = o.evento_interno_id;

grant select on disponibilidade to authenticated;
