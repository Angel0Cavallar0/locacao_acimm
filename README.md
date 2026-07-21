# Sistema de Locação de Salas — ACIMM

Aplicação web para a ACIMM gerenciar a locação dos ambientes da sede.
Stack, regras e contexto: ver [`CLAUDE.md`](./CLAUDE.md). Specs por módulo em
[`docs/features/`](./docs/features).

## Desenvolvimento

```bash
npm install
cp .env.example .env.local   # preencher as variáveis (ver abaixo)
npm run dev                  # http://localhost:3000
```

Scripts: `npm run dev` · `npm run build` · `npm run lint` (Biome) · `npm run format`.

## Variáveis de ambiente

Todos os nomes estão em [`.env.example`](./.env.example). Para desenvolvimento,
o mínimo para subir é o bloco Supabase. As integrações ausentes viram warning
(stub) em dev e são obrigatórias em produção — validação em
[`src/lib/env.ts`](./src/lib/env.ts).

Para o painel do colaborador (Spec 03) é necessário, além das chaves públicas:

- `SUPABASE_SERVICE_ROLE_KEY` — usada nas server actions administrativas
  (convite de colaborador etc.). Sem ela o convite falha com erro claro.

## Bootstrap do primeiro admin

Não há cadastro público de colaborador. O primeiro admin é criado **uma única
vez**, manualmente:

1. No **Dashboard do Supabase → Authentication → Users → Add user**, crie um
   usuário com e-mail e senha (marque "Auto Confirm User").
2. No **SQL Editor**, vincule esse usuário como admin (troque o e-mail):

   ```sql
   insert into public.colaboradores (user_id, nome, email, role, ativo)
   select id, 'Nome do Admin', email, 'admin', true
   from auth.users
   where email = 'admin@acimm.org.br';
   ```

3. Acesse `/admin/login` com essas credenciais. Os demais colaboradores são
   criados por convite dentro do painel
   (`/admin/configuracoes/colaboradores`).

## E-mails de autenticação (convite / recuperação de senha)

Os fluxos de convite e reset dependem do envio de e-mail pelo Supabase Auth.
Em produção, configurar **SMTP com o Resend** e os templates em pt-BR com a
identidade ACIMM (sem menção a ferramentas):

- **Dashboard → Authentication → Emails → SMTP Settings:** apontar para o Resend.
- **Templates (Invite / Reset Password):** o link deve levar a
  `.../admin/definir-senha` (o `redirectTo` já é enviado pelas actions). O
  cliente Supabase troca o `code` da URL por sessão em cookies e a tela permite
  definir a nova senha.

Sem SMTP configurado, o convite ainda cria o usuário, mas o e-mail pode não ser
entregue — nesse caso, use o fluxo de "Recuperar senha" ou o dashboard.

## Jobs agendados (pg_cron) — seed do Vault

Os agendamentos rodam no Postgres do Supabase (pg_cron → pg_net → rotas
`/api/cron/*`). A migration `..._cron_jobs.sql` registra os jobs, mas eles ficam
**inertes** até semear dois segredos no **Supabase Vault** (nenhum segredo vai
em código/migration). Uma única vez, no **SQL Editor** do projeto:

```sql
select vault.create_secret('https://acimm.facioflow.com.br', 'app_url');
select vault.create_secret('<CRON_SECRET da Vercel>', 'cron_secret');
```

- `app_url` — URL pública do app (sem barra final).
- `cron_secret` — o MESMO valor de `CRON_SECRET` nas env vars da Vercel (as
  rotas exigem `Authorization: Bearer <CRON_SECRET>`).

Enquanto o Vault não estiver semeado, `chamar_cron` é um no-op limpo (não chama
nada). Jobs registrados: `notificacoes-retry` (15min), `lembretes` (diário 08:00
BRT), `coffee-pdf` (segunda 07:00 BRT). Acompanhe execuções e dispare
manualmente em **Admin → Configurações → Rotinas automáticas**.

Em dev/staging não há agendamento — chame as rotas manualmente:

```bash
curl -X POST http://localhost:3000/api/cron/notificacoes-retry \
  -H "Authorization: Bearer $CRON_SECRET"
```

## Estrutura

- `src/app/(site)` — área pública (tela inicial).
- `src/app/admin/(auth)` — login, recuperar/definir senha (sem shell).
- `src/app/admin/(painel)` — painel autenticado (guard `requireColaborador`).
- `src/lib/supabase` — clients browser/server/admin.
- `src/lib/auth` — guards, rate limit, sessão.
- `supabase/migrations` — schema versionado (aplicado no projeto `acimm_db`).
