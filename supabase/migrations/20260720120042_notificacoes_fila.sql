-- Spec 15 — Fila de notificações: coluna de backoff + reserva atômica com skip locked.
-- A tabela `notificacoes` já existe (Spec 02 §5.7). Aqui adicionamos o timestamp da
-- última tentativa (base do espaçamento crescente) e a RPC que o processador e o
-- cron (Spec 16) usam para consumir pendentes sem processar a mesma linha duas vezes.

alter table notificacoes add column if not exists ultima_tentativa_em timestamptz;

-- Índice do consumo da fila (pendentes por ordem de chegada).
create index if not exists notificacoes_pendentes_idx
  on notificacoes (criado_em)
  where status = 'pendente';

/**
 * Reserva até `p_limite` notificações elegíveis para envio, de forma atômica.
 *
 * Elegível = pendente, tentativas < 5 e backoff decorrido desde a última tentativa
 * (0 / 15 / 30 / 60 / 120 min conforme o nº de tentativas). O `for update skip
 * locked` garante que processos concorrentes (disparo imediato + cron) peguem
 * conjuntos disjuntos; o pré-incremento de `tentativas` + `ultima_tentativa_em`
 * "reserva" a linha (sai da janela de elegibilidade até o próximo backoff), de modo
 * que ninguém reprocessa a mesma linha. O app envia e então marca enviada/falha.
 */
create or replace function reservar_notificacoes(p_limite int default 20)
returns table (
  id uuid,
  canal canal_notificacao,
  destinatario text,
  template text,
  payload jsonb,
  tentativas int
)
language sql
security definer
set search_path = public
as $$
  update notificacoes n
  set tentativas = n.tentativas + 1,
      ultima_tentativa_em = now()
  from (
    select nn.id
    from notificacoes nn
    where nn.status = 'pendente'
      and nn.tentativas < 5
      and (
        nn.ultima_tentativa_em is null
        or nn.ultima_tentativa_em <= now() - (
          case nn.tentativas
            when 0 then interval '0 minutes'
            when 1 then interval '15 minutes'
            when 2 then interval '30 minutes'
            when 3 then interval '60 minutes'
            else interval '120 minutes'
          end
        )
      )
    order by nn.criado_em
    for update skip locked
    limit greatest(coalesce(p_limite, 20), 0)
  ) sel
  where n.id = sel.id
  returning n.id, n.canal, n.destinatario, n.template, n.payload, n.tentativas;
$$;

revoke execute on function reservar_notificacoes(int) from public, anon, authenticated;
grant execute on function reservar_notificacoes(int) to service_role;
