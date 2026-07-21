# Spec 18 — Google Calendar: Conexão, Espelho e Convites (Bloco E, parte 2)

> Depende: Spec 06 (hooks), Spec 16 (infra de cron), Spec 17 (eventos internos). Pré-requisito externo: app OAuth no GCP criado por Angelo com redirect URIs registrados (`/api/google/callback` em localhost, vercel.app e domínio final) — pode permanecer em **modo testing** com a conta da ACIMM como test user (CLAUDE.md §6.4).
> Envs: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `TOKEN_ENCRYPTION_KEY` (getters lazy; sem elas, a seção mostra "aguardando configuração" e o resto do sistema segue intacto).

---

## 1. Objetivo

Conta Google da ACIMM conectada uma única vez pelo admin; a partir daí o sistema espelha locações e eventos internos no calendário da associação e envia o **convite de agenda** ao locatário — tudo unidirecional (banco → Calendar), com fila de reconciliação. **Falha no Calendar jamais bloqueia o fluxo de locação.**

## 2. Regras de espelho (o "quando" de cada coisa)

| Gatilho | Ação no Calendar |
|---|---|
| Locação → `aprovada` | **cria** evento no calendário da ACIMM (sem convidados — visibilidade interna da agenda) |
| Reagendamento (≤ `aprovada`) | **atualiza** data/horário/salas |
| Locação → `confirmada` | **adiciona o locatário como attendee** (`locatario_email`) com `sendUpdates: 'all'` → Google envia o convite oficial |
| Locação → `recusada`/`cancelada` | **remove** o evento (`sendUpdates: 'all'` se já havia convidado — o Google avisa o cancelamento) |
| `realizada`/`finalizada` | mantém (histórico na agenda) |
| Evento interno criado/alterado | cria/atualiza espelho (`"{título} · Evento ACIMM"`) |
| Evento interno cancelado / remanejado de sala | remove / atualiza |

**Racional do convite só na `confirmada`:** convidar na aprovação colocaria na agenda do cliente um evento que ainda depende de contrato e pagamento — e o Google dispararia cancelamento se caísse. Convite = negócio fechado. (Consistente com a notificação `confirmada` do Spec 15.)

Conteúdo do evento (locação): summary `LOC-{nº} · {locatário} · {sala(s)}`; description com período, pessoas, coffee e link do detalhe no admin; location: endereço da ACIMM; timezone `America/Sao_Paulo`. Multi-sala = **um** evento listando as salas (não N eventos).

## 3. Conexão OAuth — Configurações → Integrações (admin only)

- **Conectar:** server action gera a URL de autorização — scopes `https://www.googleapis.com/auth/calendar.events` + `calendar.readonly` (este só para listar calendários na escolha do alvo), `access_type=offline`, `prompt=consent`, **`state` assinado (CSRF)**.
- **Callback `/api/google/callback`:** valida `state` → troca `code` por tokens → **cifra o refresh token (AES-256-GCM com `TOKEN_ENCRYPTION_KEY`, IV único por registro)** → upsert em `google_conexoes` (singleton) → redireciona à tela com sucesso.
- **Escolher calendário:** após conectar, select com os calendários da conta (`calendarList.list`); padrão `primary`; gravado em `calendario_id`.
- **Painel de status:** conta conectada, calendário alvo, conectado por/quando, contagem de pendências de espelho; ações **Trocar calendário**, **Reconectar**, **Desconectar** (chama o revoke do Google + limpa o registro; pendências ficam acumulando).
- Access token: obtido sob demanda via refresh (cache curto em memória); `invalid_grant`/revogação externa → conexão marcada `expirada` + alerta visível na tela (e as pendências acumulam até reconectar).

## 4. Fila de reconciliação — Migration `0023_google_sync`

```sql
alter table locacoes        add column google_sync_pendente boolean not null default false;
alter table eventos_internos add column google_sync_pendente boolean not null default false;

select cron.schedule('google-reconciliacao', '*/15 * * * *', $$select chamar_cron('google-reconciliacao')$$);
```

- Hooks/actions **apenas marcam** `google_sync_pendente = true` e disparam o processador via `after()` (best-effort) — nenhuma chamada ao Google dentro do fluxo do usuário.
- Processador (`/api/cron/google-reconciliacao` + disparo imediato): varre pendentes (lote 30, `skip locked`), decide a operação pelo estado atual (create/patch/delete conforme §2, usando `google_event_id` nulo/presente), executa, limpa a flag. Falha mantém a flag (próximo ciclo tenta). Evento apagado manualmente no Calendar (404 no patch) → recria.
- **Sem conexão ativa:** flags acumulam; ao conectar, o próximo ciclo despacha o backlog inteiro — critério de aceite.

## 5. Cliente — `lib/integracoes/google.ts`

Wrapper fino da Calendar API v3 (fetch direto, sem SDK pesado): `criarEvento`, `atualizarEvento`, `removerEvento`, `listarCalendarios`, refresh de token. Erros: 401 → tentar refresh 1×, depois marcar `expirada`; 403 rate/quota e 5xx → deixa a flag para o próximo ciclo; 404 em patch/delete → tratar conforme §4. Cifra/decifra em `lib/utils/crypto.ts` (AES-256-GCM, testes de ida e volta).

## 6. Critérios de aceite
- [ ] Fluxo OAuth completo com `state` validado (request forjado sem state → rejeitado); refresh token cifrado no banco (coluna ilegível sem a chave — teste decifrando com chave errada falha).
- [ ] Aprovada cria no calendário certo; confirmada adiciona attendee e o convite chega no e-mail do locatário; cancelamento remove com aviso do Google; reagendamento atualiza.
- [ ] Evento interno espelha no CRUD, remanejamento de sala atualiza, cancelamento remove.
- [ ] Multi-sala vira um único evento com as salas no texto.
- [ ] Nenhuma chamada ao Google no caminho síncrono do usuário (aprovar com Google fora do ar: transição ok, flag pendente, ciclo posterior espelha).
- [ ] Desconectado/expirado: backlog acumula e é despachado integralmente ao reconectar; painel mostra pendências e estado `expirada`.
- [ ] Evento apagado à mão no Calendar é recriado pela reconciliação.
- [ ] Sem envs Google: seção "aguardando configuração", zero erro no restante do sistema.
- [ ] Não-associado também recebe convite na `confirmada` (attendee é `locatario_email`, independe de conta no portal).
