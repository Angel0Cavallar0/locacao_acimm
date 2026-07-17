# Spec 03 — Auth do Colaborador + Shell do Painel Admin (Fase 2, parte 1)

> Depende: Spec 00 (setup) e Spec 02 (banco — usa `colaboradores` e `eh_colaborador()`).
> Referência: CLAUDE.md §4 (segurança server-side), §5.1 (colaborador), §9 (telas admin).
> Escopo: login/sessão do colaborador, proteção de `/admin/*`, layout base do painel e gestão de colaboradores. **Não inclui** nenhuma feature de negócio (salas, locações etc. — specs seguintes).

---

## 1. Objetivo

Colaborador da ACIMM entra com e-mail + senha e cai num painel com navegação completa (itens ainda não implementados aparecem como stub). Admin convida novos colaboradores. Nenhuma rota ou ação administrativa é alcançável sem sessão válida de colaborador ativo.

---

## 2. Sessão e proteção de rotas

- **`@supabase/ssr`** com cookies httpOnly. Clients conforme Spec 00 (`lib/supabase/server.ts` para RSC/actions, `client.ts` no browser, `admin.ts` service role `server-only`).
- **Middleware** (`src/middleware.ts`), matcher `/admin/:path*`:
  - Refresh da sessão a cada request (padrão `@supabase/ssr`).
  - Sem sessão → redirect `/admin/login?next=<url>`. Exceções: `/admin/login`, `/admin/definir-senha`, `/admin/recuperar-senha`.
  - O middleware é UX, **não autoridade**: a checagem real acontece nos guards abaixo, em todo layout e server action.
- **Guards** em `lib/auth/guards.ts` (server-only):

```ts
// Busca a sessão e o registro em `colaboradores` (ativo = true).
// Lança/redireciona se inválido. Retorna { user, colaborador }.
export async function requireColaborador(): Promise<CtxColaborador>
export async function requireAdmin(): Promise<CtxColaborador>   // role = 'admin'
```

  - `requireColaborador()` é a **primeira linha de toda server action e de todo layout/page em `/admin`** (exceto rotas públicas de auth). Sem exceções.
  - Colaborador com `ativo = false` falha no guard mesmo com sessão Supabase válida (revogação imediata sem esperar expirar token).

---

## 3. Telas de autenticação

### 3.1 Login (`/admin/login`)
- Card centrado: logo ACIMM pequena + "Painel do Colaborador", campos e-mail e senha, botão "Entrar", link "Esqueci minha senha".
- Server action `loginColaborador`: valida com Zod → `signInWithPassword` → confirma registro ativo em `colaboradores` (**se o auth user existe mas não é colaborador ativo: `signOut` imediato e erro genérico**) → redirect para `next` ou `/admin`.
- Mensagem de erro única e genérica ("E-mail ou senha inválidos") para qualquer falha — sem revelar se o e-mail existe.
- **Rate limiting** por IP + e-mail (Upstash ou verificação própria em tabela) — ex.: 5 tentativas/minuto, backoff.
- Já autenticado como colaborador → redirect direto para `/admin`.

### 3.2 Recuperar senha (`/admin/recuperar-senha`)
- Campo e-mail → `resetPasswordForEmail` com `redirectTo` para `/admin/definir-senha`. Resposta idêntica havendo ou não cadastro ("Se o e-mail estiver cadastrado, você receberá as instruções").

### 3.3 Definir senha (`/admin/definir-senha`)
- Destino comum do convite e do reset (sessão temporária do link Supabase). Campos: nova senha + confirmação; regras mínimas (>= 10 caracteres, indicador de força simples). Ao concluir → `/admin`.
- Link expirado/inválido → mensagem clara + caminho para pedir novo.

### 3.4 E-mails de auth
- Configurar SMTP do Supabase Auth com o **Resend** e templates em pt-BR com identidade ACIMM (convite, reset). Sem menção a ferramentas (CLAUDE.md §1).

---

## 4. Shell do painel (`/admin` layout)

Layout aplicado a todo `/admin/*` autenticado — `requireColaborador()` no layout raiz do segmento.

### 4.1 Estrutura
- **Sidebar** (desktop fixa ~256px; mobile: drawer via botão hambúrguer no header):
  - Logo ACIMM + rótulo "Locação de Salas".
  - Navegação (ícones lucide + rótulo): Dashboard `/admin` · Calendário `/admin/calendario` · Locações `/admin/locacoes` · Salas `/admin/salas` · Eventos ACIMM `/admin/eventos` · Coffee Break `/admin/coffee` · Contratos `/admin/contratos` · Comissões `/admin/comissoes` · Lista de Espera `/admin/lista-espera` · Configurações `/admin/configuracoes` (este só visível para `role = 'admin'` — e protegido por `requireAdmin()` na página, a visibilidade do menu é cosmética).
  - Item ativo destacado com token `--color-brand`.
- **Header**: título da página atual, à direita nome do colaborador + menu (perfil → trocar senha; "Sair" → server action `signOut` + redirect `/admin/login`).
- **Conteúdo**: container com padding consistente; `sonner` para toasts globais.
- Rotas ainda sem spec implementado: page stub padronizada (`<PaginaEmConstrucao titulo="…" />`) — nunca 404 dentro do painel.

### 4.2 Design
- Tokens do `@theme` exclusivamente; densidade de informação confortável para uso diário (é ferramenta de trabalho, não landing).
- Responsivo: o painel será usado em desktop na ACIMM, mas precisa funcionar em celular (Yasmin resolve muita coisa pelo WhatsApp/celular hoje).
- Acessibilidade: navegação por teclado na sidebar, `aria-current` no item ativo, foco visível.

---

## 5. Gestão de colaboradores (`/admin/configuracoes/colaboradores`) — admin only

- **Lista**: nome, e-mail, role, status (ativo/inativo), criado em.
- **Convidar** (dialog): nome, e-mail, role. Server action `convidarColaborador` (guard `requireAdmin`, service role):
  1. `auth.admin.inviteUserByEmail(email, { redirectTo: '/admin/definir-senha' })`.
  2. Insert em `colaboradores` (`user_id`, nome, e-mail, role, `ativo = true`).
  3. Transacional na prática: se o insert falhar, remover o auth user criado (não deixar órfão).
- **Ativar/desativar**: toggle (desativar ≠ excluir; histórico preservado). Admin não pode desativar a si mesmo nem o último admin ativo (validar na action).
- **Trocar role**: select admin/colaborador, mesmas proteções.
- **Bootstrap do primeiro admin**: documentado no README — criar auth user pelo dashboard do Supabase + insert manual em `colaboradores` com `role = 'admin'` (uma única vez; sem rota pública de setup).

---

## 6. Segurança (checklist específico deste spec)

- Toda server action deste spec começa com o guard adequado; payloads validados com Zod.
- Cookies de sessão httpOnly/secure (produção); nenhum token em localStorage.
- `signOut` global no logout (revoga refresh token).
- Login/recuperação com respostas genéricas + rate limit (anti-enumeração — CLAUDE.md §4.7).
- Nenhuma dessas rotas expõe dados via client fetch direto ao Supabase além do fluxo de auth — dados do painel virão sempre de RSC/actions nos próximos specs.

---

## 7. Critérios de aceite

- [ ] Acessar qualquer `/admin/*` sem sessão redireciona para `/admin/login` preservando `next`.
- [ ] Login com credenciais válidas de colaborador ativo entra no painel; auth user que não é colaborador ativo recebe erro genérico e não mantém sessão.
- [ ] Colaborador desativado com sessão aberta é barrado no próximo request (guard).
- [ ] Convite cria auth user + registro em `colaboradores`; convidado define senha e acessa. Falha parcial não deixa auth user órfão.
- [ ] `/admin/configuracoes/*` inacessível para `role = 'colaborador'` (mesmo por URL direta).
- [ ] Não é possível desativar o último admin ativo.
- [ ] Sidebar/drawer funcionais em desktop e mobile; itens sem feature mostram stub, nunca 404.
- [ ] Rate limit ativo no login; mensagens de erro não revelam existência de e-mail.
- [ ] Botão "Voltar ao início" nada expõe: tela de login não lista nada nem faz fetch de dados.
