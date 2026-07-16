# Spec 00 — Setup do Projeto (Fase 0)

> Pré-requisito de todos os outros specs. Executar uma única vez.
> Contexto geral, stack e regras: ver `CLAUDE.md` na raiz.

## Objetivo

Criar o esqueleto do projeto pronto para receber as features: Next.js 16 configurado, Supabase inicializado, estrutura de pastas definida, tema com tokens centralizados e variáveis de ambiente mapeadas.

## Passos

### 1. Scaffold

```bash
npx create-next-app@latest acimm-locacao --typescript --tailwind --app --src-dir --import-alias "@/*"
```

- Confirmar que a versão instalada do `next` é **16.2.x ou superior** (checar `npm show next version` antes; nunca 15.x).
- Tailwind CSS **v4** (config via `@theme` no CSS, sem `tailwind.config.js` legado).
- TypeScript `strict: true`.
- Lint: **Biome** (o `next lint` foi removido no Next 16). Adicionar `biome.json` com regras padrão + `npm run lint` e `npm run format`.

### 2. shadcn/ui

```bash
npx shadcn@latest init
```

- Base color neutral. Instalar desde já: `button`, `card`, `input`, `label`, `form`, `dialog`, `sonner` (toasts), `badge`, `table`, `calendar`, `select`, `tabs`.

### 3. Estrutura de pastas

```
src/
  app/
    (site)/              # páginas públicas
      page.tsx           # tela inicial (Spec 01)
    (portal)/            # área do associado (autenticada)
      login/page.tsx     # stub nesta fase
    admin/
      login/page.tsx     # stub nesta fase
    api/
      cron/              # route handlers de agendamento (protegidos por CRON_SECRET)
      google/
        callback/route.ts # stub — retorna 501 até credenciais GCP
  components/
    ui/                  # shadcn (gerado)
    site/                # componentes da área pública
    portal/              # componentes do associado
    admin/               # componentes do colaborador
  lib/
    supabase/
      client.ts          # browser client (anon)
      server.ts          # server client (cookies) — import 'server-only'
      admin.ts           # service role — import 'server-only'
    integracoes/         # sympla.ts, autentique.ts, google.ts, evolution.ts, resend.ts (stubs tipados)
    notificacoes/
    validacoes/          # schemas Zod compartilhados
    utils/
supabase/
  migrations/            # SQL versionado
docs/
  features/              # specs (este arquivo e os próximos)
```

- Os route groups `(site)` e `(portal)` têm layouts próprios; `admin` tem layout e middleware próprios.
- Stubs de login: página mínima com o layout base e texto "Em construção" — existem apenas para os botões da tela inicial não retornarem 404. Serão implementados nos specs de auth.

### 4. Tema e tokens (marca pendente)

O material de marca da ACIMM ainda não chegou. Criar em `src/app/globals.css` um bloco único de tokens que TODA a UI consome — nenhum componente usa cor/fonte hardcoded:

```css
@theme {
  --color-brand: oklch(45% 0.09 250);        /* placeholder: azul institucional neutro */
  --color-brand-foreground: oklch(98% 0 0);
  --color-surface: oklch(99% 0 0);
  --color-surface-muted: oklch(96% 0.005 250);
  --color-ink: oklch(22% 0.01 250);
  --color-ink-muted: oklch(50% 0.01 250);
  --font-display: var(--font-sans);           /* trocar quando a fonte da marca chegar */
}
```

- Quando logo/cores/fontes chegarem, a troca acontece **somente neste bloco**.
- Logo: usar `public/logo-acimm.svg` — criar um placeholder simples (monograma "ACIMM" tipográfico) até o arquivo oficial chegar.

### 5. Variáveis de ambiente

- Criar `.env.example` com todos os nomes da tabela §3 do CLAUDE.md (sem valores).
- Criar `.env.local` (git-ignored). `src/lib/env.ts` valida as variáveis com Zod no boot (falha cedo se faltar algo em produção; em dev, integrações ausentes viram warning + stub).

### 6. Supabase

```bash
npx supabase init
npx supabase start   # ambiente local via Docker
```

- Nenhuma migration nesta fase — o schema entra no Spec de banco de dados, após aprovação.
- Conferir que `client.ts`/`server.ts`/`admin.ts` compilam e que `admin.ts` importa `server-only`.

### 7. Repositório

- Git init, `.gitignore` (padrão Next + `.env*`, exceto `.env.example`).
- Commit inicial: `chore: scaffold next 16 + supabase + tema base`.

## Critérios de aceite

- [ ] `npm run dev` sobe sem erros e sem warnings de versão.
- [ ] `next` >= 16.2.x, Tailwind v4, TS strict, Biome rodando.
- [ ] Estrutura de pastas conforme acima; stubs de `/login` e `/admin/login` respondem 200.
- [ ] Tokens de tema centralizados; nenhuma cor hardcoded fora do `@theme`.
- [ ] `.env.example` completo e `lib/env.ts` validando.
- [ ] Supabase local rodando; pastas de migrations criadas e vazias.
