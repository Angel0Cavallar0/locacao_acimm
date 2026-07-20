# Spec 09 — Auth do Associado + Shell do Portal (Fase 3, parte 1 — abre o Bloco C)

> Depende: Spec 02 (`associados` com `user_id`), Spec 03 (padrões de guard/middleware).
> Referência: CLAUDE.md §5.2, §10.2. Rotas: `/login`, `/cadastro`, `/recuperar-senha`, `/definir-senha` + layout do route group `(portal)`.
> Inclui a tela admin `/admin/associados` (gestão de contas — fallback manual combinado).

---

## 1. Objetivo

Associado cria conta no primeiro acesso (verificação por e-mail da base Sophus), entra com **documento + e-mail + senha** e cai no portal. Colaborador tem uma tela para destravar casos em que o e-mail do Sophus está desatualizado.

## 2. Decisões de regra (validadas com Angelo — não alterar sem alinhamento)

1. **Campo de documento aceita CNPJ e CPF** (rótulo "CNPJ ou CPF"): a base tem associados PF legítimos; exigir só CNPJ trancaria gente de verdade pra fora.
2. **Situação restringe locação, não consulta**: `suspenso`/`excluido` com conta existente ainda **loga** (acesso aos próprios dados/histórico — inclusive por LGPD), com banner de situação; criar solicitação é bloqueado (server-side, Spec 11). **Primeiro acesso**, porém, exige `situacao = 'ativo'` — quem não está ativo é orientado a contatar a ACIMM.
3. **Documento duplicado** (existem duplicatas legítimas na base Sophus): o primeiro acesso lista os registros do documento com dados mascarados para o usuário escolher o seu.

## 3. Login (`/login`)

- Campos: documento (máscara dinâmica CPF/CNPJ) + e-mail + senha. Os três obrigatórios (CLAUDE.md §5.2).
- Server action `loginAssociado`: Zod → normaliza documento (só dígitos) → `signInWithPassword(email, senha)` → carrega `associados` por `user_id` → **compara documento**; divergência = `signOut` imediato + erro genérico único ("Dados de acesso inválidos") para qualquer falha — nunca revelar qual campo errou (anti-enumeração, CLAUDE.md §4.7).
- Rate limit por IP + documento (5/min, backoff).
- Sucesso → `/disponibilidade` (ou `next`). Já logado → redirect direto.
- Link "Primeiro acesso? Criar conta" → `/cadastro`; "Esqueci minha senha" → `/recuperar-senha`.

## 4. Primeiro acesso (`/cadastro`) — fluxo em etapas

**Etapa 1 — Documento:** informa CNPJ/CPF → server action busca em `associados`:
- Nenhum match ou match sem `situacao = 'ativo'` → mensagem única: "Não encontramos cadastro ativo para este documento. Entre em contato com a ACIMM." (não distinguir inexistente de suspenso).
- Match já com `user_id` vinculado → "Este cadastro já possui conta" + links de login/recuperação.
- Múltiplos matches elegíveis → lista para escolher, com razão social parcial e e-mail(s) mascarado(s) (`c•••@empresa.com.br`).

**Etapa 2 — Verificação:** gera código de 6 dígitos e envia (Resend) para **todos** os e-mails do array `emails` do registro escolhido (o dono de qualquer um deles é dono do cadastro). Exibe os destinos mascarados. Em dev sem `RESEND_API_KEY`: código no console do servidor (nunca em produção).

**Etapa 3 — Código:** input de 6 dígitos; 5 tentativas; expira em 15 min; reenvio com cooldown de 60s (novo código invalida o anterior).

**Etapa 4 — Conta:** se `emails[]` tem vários, escolhe **qual será o e-mail de login**; define senha (≥ 10 caracteres, indicador de força) → server action transacional: `auth.admin.createUser` (e-mail confirmado) → `update associados set user_id` → sessão iniciada → `/disponibilidade` com boas-vindas. Falha parcial não deixa auth user órfão (mesmo padrão do Spec 03 §5).

### Migration `0016_codigos_verificacao`

```sql
create table codigos_verificacao (
  id uuid primary key default gen_random_uuid(),
  associado_id uuid not null references associados(id) on delete cascade,
  codigo_hash text not null,              -- hash (pgcrypto) — nunca o código em claro
  expira_em timestamptz not null,
  tentativas integer not null default 0,
  usado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index codigos_verificacao_lookup_idx on codigos_verificacao (associado_id, criado_em desc);
-- RLS on, nenhuma policy (acesso exclusivo via service role)
alter table codigos_verificacao enable row level security;
```

## 5. Recuperação de senha (`/recuperar-senha`, `/definir-senha`)

- Padrão Supabase (`resetPasswordForEmail` → `/definir-senha`), respostas neutras ("Se o e-mail estiver cadastrado…"), mesmos requisitos de senha.

## 6. Shell do portal — layout `(portal)`

- **Header** fixo: logo ACIMM + "Locação de Salas"; navegação: **Disponibilidade** · **Minhas locações** · **Perfil**; menu do usuário (nome do associado, sair). Mobile: menu vira drawer ou bottom-nav — escolher o mais limpo com shadcn, mobile-first (público resolve tudo no celular).
- **Guard `requireAssociado()`** em `lib/auth/guards.ts`: sessão + registro em `associados` por `user_id`; retorna `{ user, associado }`. Aplicado em todo layout/action do portal (autoridade), com middleware cobrindo `/disponibilidade`, `/locacoes/:path*`, `/perfil` (UX).
- Banner persistente quando `situacao ≠ 'ativo'`: "Sua situação junto à ACIMM é {…}. Novas locações estão indisponíveis — fale com a ACIMM."
- Stubs `PaginaEmConstrucao` para as três páginas (Specs 10–12). Nunca 404.

## 7. Gestão de contas — `/admin/associados` (novo item "Associados" na sidebar)

Fallback combinado para e-mail desatualizado no Sophus + suporte do dia a dia:
- **Lista/busca** (mesmo autocomplete do Spec 07): nome, documento, situação, e-mails, **status da conta** (sem conta / ativa / e-mail de login).
- Ações (server actions com `requireColaborador()`):
  - **Liberar acesso manualmente:** colaborador confirma a identidade pelos canais atuais (telefone/WhatsApp), informa/corrige o e-mail de contato e dispara convite (`inviteUserByEmail` → `/definir-senha` do portal) + vincula `user_id`. Registrar quem liberou (log/observação).
  - **Reenviar convite** · **Desvincular conta** (associado trocou de e-mail/perdeu acesso — permite novo primeiro acesso; confirmação dupla).
- Dados cadastrais permanecem somente leitura (fonte é o Sophus — correção de cadastro é lá; o e-mail usado no convite manual não sobrescreve `emails[]`).

## 8. Critérios de aceite

- [ ] Login exige os três campos; qualquer falha (senha errada, documento divergente, e-mail inexistente) retorna a MESMA mensagem e tempo de resposta similar.
- [ ] Primeiro acesso: fluxo completo com código por e-mail; duplicatas mostram seletor mascarado; não-ativo recebe mensagem única sem revelar situação.
- [ ] Código: hash no banco, 15 min, 5 tentativas, cooldown de reenvio; código anterior invalidado.
- [ ] Conta criada vincula `user_id`; falha parcial não deixa auth user órfão.
- [ ] Suspenso/excluído com conta loga e vê banner; primeiro acesso deles é negado.
- [ ] `requireAssociado()` protege todas as rotas do portal; colaborador logado NÃO acessa o portal como associado (e vice-versa — sessões de perfis distintos não se cruzam).
- [ ] `/admin/associados`: liberar acesso manual funciona ponta a ponta; desvincular exige dupla confirmação e permite novo primeiro acesso.
- [ ] Rate limits ativos em login, cadastro (por documento e IP) e reenvio de código.
- [ ] Migration 0016 aplicada; códigos nunca aparecem em claro em logs/banco (produção).
