# Spec 01 — Tela Inicial (`/`)

> Depende do Spec 00 (setup). Rota pública no route group `(site)`.
> Referência: CLAUDE.md §10.1.

## Objetivo

Página de entrada única do sistema. Não é um site institucional: a página existe para **rotear dois públicos** (associado que quer locar × colaborador da ACIMM) no menor tempo possível, transmitindo que se trata de um serviço oficial da ACIMM.

## Conteúdo e hierarquia

Layout centrado vertical e horizontalmente, uma única dobra, sem scroll em desktop e mobile:

1. **Logo da ACIMM** (`public/logo-acimm.svg`, placeholder até a marca chegar) — elemento dominante do topo do bloco.
2. **Título:** `Sistema de Locação de Salas` (h1, fonte display, sem subtítulo de marketing).
3. **Linha de apoio (opcional, discreta):** `Reserve os ambientes da ACIMM de forma simples e acompanhe tudo online.` — uma frase, `--color-ink-muted`. Nada além disso.
4. **Ações:**
   - **Botão primário — `Locar sala`**: destaque total (cor `--color-brand`, tamanho lg, largura confortável para toque). Destino: ver "Comportamento de sessão".
   - **Botão secundário — `Acesso do colaborador`**: variante `ghost`/`link`, visualmente subordinado (o público majoritário é o associado). Destino: `/admin/login`.
5. **Rodapé discreto:** `ACIMM — Associação Comercial e Empresarial de Mogi Mirim`. Sem menção à FacioFlow ou a tecnologias (regra do CLAUDE.md §1).

Wireframe:

```
┌──────────────────────────────┐
│                              │
│          [LOGO ACIMM]        │
│                              │
│   Sistema de Locação         │
│   de Salas                   │
│   frase de apoio…            │
│                              │
│   [     Locar sala     ]     │
│     Acesso do colaborador    │
│                              │
│  ACIMM — Associação Comercial│
└──────────────────────────────┘
```

## Comportamento de sessão

Server Component. No servidor, verificar a sessão Supabase **uma vez** (sem flash de conteúdo):

| Estado | Botão primário leva a |
|---|---|
| Sem sessão | `/login` |
| Sessão de associado | `/disponibilidade` (rótulo pode virar `Ver disponibilidade`) |
| Sessão de colaborador | manter página normal; o botão secundário vira `Ir para o painel` → `/admin` |

Não redirecionar automaticamente ninguém a partir de `/` — a página é ponto de escolha, não gate.

## Design

- Consumir exclusivamente os tokens do `@theme` (Spec 00 §4). Nenhum hex na página.
- Mobile-first: em telas pequenas os botões ocupam a largura do container (max ~360px), empilhados com espaçamento generoso; alvo de toque >= 44px.
- Um único momento de movimento, sutil: fade + leve translate do bloco no carregamento (CSS only), respeitando `prefers-reduced-motion`. Nenhuma outra animação.
- Fundo: `--color-surface` sólido ou um gradiente muito discreto derivado de `--color-brand` — decidir na implementação, mas manter sobriedade institucional (associação comercial, público variado, muitos de baixa familiaridade digital: clareza > estilo).
- Estados de foco visíveis nos dois botões (navegação por teclado).

## Técnica

- Arquivo: `src/app/(site)/page.tsx` (Server Component; zero JS de cliente além do necessário do framework).
- Logo via `next/image` com `priority`.
- Metadata: `title: "Sistema de Locação de Salas | ACIMM"`, `description` breve; `openGraph` básico com a logo.
- Página estática exceto pela checagem de sessão — usar leitura de cookies no servidor sem quebrar streaming.
- Lighthouse alvo: performance e acessibilidade >= 95 (página trivial, sem desculpa).

## Fora de escopo (não implementar aqui)

- Formulários de login (specs de auth).
- Conteúdo institucional, fotos de salas, listagem de ambientes.
- Header/menu de navegação — a página não tem menu.

## Critérios de aceite

- [ ] `/` renderiza logo + título + dois botões conforme hierarquia acima.
- [ ] Sem sessão: `Locar sala` → `/login`; `Acesso do colaborador` → `/admin/login` (stubs respondem 200).
- [ ] Com sessão de associado: primário → `/disponibilidade`.
- [ ] Sem scroll em viewport >= 360×640; alvos de toque adequados.
- [ ] Nenhuma cor/fonte fora dos tokens; `prefers-reduced-motion` respeitado.
- [ ] Nenhuma menção a FacioFlow/stack no HTML renderizado.
