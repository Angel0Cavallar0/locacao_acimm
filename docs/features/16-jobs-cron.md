# Spec 16 — Jobs Agendados via pg_cron (Bloco D, parte 4 — fecha o bloco)

> Depende: Spec 15 (`processarNotificacoes`) e Spec 08 (`gerarPdfCompras`). Extensões `pg_cron`/`pg_net` já habilitadas (migration 0002).
> Referência: CLAUDE.md §2.1. Este spec cria a INFRA (padrão de rota + agendador seguro) e registra os 3 jobs já existentes; Specs 13B e 17 registram os seus seguindo o mesmo padrão.

---

## 1. Objetivo

Agendamentos rodando pelo Postgres do Supabase (pg_cron) chamando rotas da aplicação (pg_net), com autenticação, idempotência e visibilidade — sem depender do Vercel Cron.

## 2. Padrão das rotas — `/api/cron/{job}/route.ts`

- **POST only**; `Authorization: Bearer {CRON_SECRET}` obrigatório (getter lazy) — ausente/errado → 401 sem corpo revelador. `export const maxDuration = 60`.
- **Idempotentes e limitadas por lote**: cada execução processa no máximo N itens e retorna resumo `{ processados, falhas }`; o que não coube fica para a próxima janela. Rodar duas vezes seguidas não duplica efeito (dedupe descrito por job).
- Em dev/staging não há agendamento — as rotas são chamadas manualmente (curl/Insomnia) com o secret local.

## 3. Agendador — Migration `0021_cron_jobs`

Segredos **não vão em migration**. Usar o **Supabase Vault** (extensão já instalada), com seed manual único via SQL Editor do projeto (documentar no README):

```sql
select vault.create_secret('https://<dominio-do-app>', 'app_url');
select vault.create_secret('<CRON_SECRET da Vercel>', 'cron_secret');
```

Migration cria o helper e os agendamentos:

```sql
create or replace function chamar_cron(rota text) returns bigint
language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'app_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret';
  return net.http_post(
    url := v_url || '/api/cron/' || rota,
    headers := jsonb_build_object('Authorization', 'Bearer ' || v_secret, 'Content-Type', 'application/json'),
    timeout_milliseconds := 55000
  );
end $$;
revoke execute on function chamar_cron(text) from anon, authenticated;

-- horários em UTC (Brasil fixo em UTC-3, sem horário de verão)
select cron.schedule('notificacoes-retry', '*/15 * * * *', $$select chamar_cron('notificacoes-retry')$$);
select cron.schedule('lembretes',          '0 11 * * *',   $$select chamar_cron('lembretes')$$);        -- 08:00 BRT
select cron.schedule('coffee-pdf',         '0 10 * * 1',   $$select chamar_cron('coffee-pdf')$$);       -- seg 07:00 BRT

insert into configuracoes (chave, valor, descricao) values
('contato_compras', '{"whatsapp": ""}', 'WhatsApp do setor de compras (recebe o PDF semanal do coffee)')
on conflict (chave) do nothing;
```

(Specs 13B/17 adicionam `autentique-reconciliacao` `*/30` e `sympla-inscritos` `0 * * * *` em migrations próprias com o MESMO helper.)

## 4. Os três jobs deste spec

### 4.1 `notificacoes-retry` — a cada 15min
Chama `processarNotificacoes(50)` (Spec 15). Dedupe/lock já resolvidos lá (`skip locked`, backoff por tentativas).

### 4.2 `lembretes` — diário, 08:00 BRT
- Seleciona locações **`confirmada`** com evento **amanhã** (data em Sao_Paulo) e enfileira `lembrete_pre_evento` (par WhatsApp+e-mail) via fila do Spec 15.
- **Dedupe:** antes de enfileirar, verifica se já existe `notificacoes` daquele template para a locação — rodar o job de novo no mesmo dia não duplica.

### 4.3 `coffee-pdf` — segunda, 07:00 BRT
- `gerarPdfCompras(semana corrente seg–dom)` (Spec 08) → armazena no Storage (`coffee-pdfs/{ano}-{semana}.pdf`, bucket privado novo na mesma migration) → enfileira envio.
- **Envio como mídia:** a fila do Spec 15 ganha suporte a payload `{ tipo: 'documento', url, legenda }` no canal WhatsApp (Evolution `sendMedia/document`), destinatário = `configuracoes.contato_compras.whatsapp`.
- Número não configurado → skip com log (sem lixo na fila). Semana sem nenhum pedido firme → não gera nem envia (nada de PDF vazio toda segunda).
- Dedupe: existência do arquivo da semana no Storage + notificação correspondente.

## 5. Visibilidade — `/admin/configuracoes` (seção "Rotinas automáticas", admin only)

Tabela lida de `cron.job_run_details` (service role): job, agenda, última execução, status (sucesso/falha), próxima estimada. Botão **"Executar agora"** por job (server action `requireAdmin` chama a própria rota internamente) — essencial para suporte sem SQL.

## 6. Critérios de aceite
- [ ] Rotas rejeitam sem/with secret errado (401) e métodos ≠ POST; com secret, processam e retornam resumo.
- [ ] Migration 0021 aplicada; seed do Vault documentado no README; nenhum secret em código/migration.
- [ ] `chamar_cron` inacessível a anon/authenticated; jobs aparecem em `cron.job` e execuções em `cron.job_run_details`.
- [ ] Lembretes: só confirmadas com evento amanhã; reexecução no mesmo dia não duplica (teste com "Executar agora" 2×).
- [ ] Coffee: PDF da semana no Storage + WhatsApp com documento; sem pedidos → não gera; sem número → skip logado.
- [ ] Retry da fila comprovado ponta-a-ponta: derrubar Evolution, acumular, religar, cron despacha.
- [ ] Seção "Rotinas automáticas" mostra execuções reais e "Executar agora" funciona.
- [ ] Fluxo inteiro do Bloco D funcionando em produção: solicitação → aprovação → contrato (modo e-mail) → pagamento → confirmada → lembrete D-1, tudo com notificações registradas.
